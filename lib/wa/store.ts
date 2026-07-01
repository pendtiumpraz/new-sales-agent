import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { platformSettingTable, waSessionTable, waOutboxTable } from "@/lib/db/schema";
import type { TenantContext } from "@/lib/db/tenant-context";
import { tenantService } from "@/modules/tenant/service";

// WhatsApp scaffold store (doc 41). The gateway (Baileys/openclaw on a VPS) is
// outbound-only: it POLLS the outbox and PUSHes qr/status/inbound here, so the
// VPS needs no domain/open port and the app stays 100% on Vercel.

export type WaMode = "per_sales" | "per_platform";

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(platformSettingTable).where(eq(platformSettingTable.key, key)).limit(1);
  return row?.value ?? null;
}
export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(platformSettingTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: platformSettingTable.key, set: { value, updatedAt: new Date() } });
}

export async function getWaMode(): Promise<WaMode> {
  return (await getSetting("wa_mode")) === "per_sales" ? "per_sales" : "per_platform";
}

// Reply-only allowlist (Phase 3) — the backend decides which numbers the AI may
// auto-reply to. Per-tenant setting `wa_reply_allowlist:<tenantId>` = comma-list
// of numbers. Empty/unset = allow all (back-compat). Match on trailing digits so
// "+62…" vs "0…" formatting doesn't matter.
export async function waReplyAllowed(tenantId: string, from: string): Promise<boolean> {
  const raw = await getSetting(`wa_reply_allowlist:${tenantId}`);
  if (!raw || !raw.trim()) return true;
  const num = from.replace(/\D/g, "");
  const allow = raw.split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean);
  return allow.some((a) => num.endsWith(a) || a.endsWith(num));
}

// Which session the current user owns, given the mode.
export function sessionIdFor(ctx: TenantContext, mode: WaMode): string {
  return mode === "per_sales" ? `rep:${ctx.userId}` : `platform:${ctx.tenantId}`;
}

export type WaSession = typeof waSessionTable.$inferSelect;

export async function getSession(sessionId: string): Promise<WaSession | null> {
  const [row] = await db.select().from(waSessionTable).where(eq(waSessionTable.id, sessionId)).limit(1);
  return row ?? null;
}

export async function getOrCreateSession(ctx: TenantContext, mode: WaMode): Promise<WaSession> {
  const id = sessionIdFor(ctx, mode);
  const existing = await getSession(id);
  if (existing) return existing;
  await db
    .insert(waSessionTable)
    .values({
      id,
      tenantId: ctx.tenantId,
      ownerType: mode === "per_sales" ? "rep" : "platform",
      ownerId: mode === "per_sales" ? ctx.userId : ctx.tenantId,
      status: "idle",
    })
    .onConflictDoNothing();
  return (await getSession(id))!;
}

export async function setSessionQr(sessionId: string, qr: string): Promise<void> {
  await db
    .update(waSessionTable)
    .set({ qr, status: "qr", updatedAt: new Date() })
    .where(eq(waSessionTable.id, sessionId));
}

export async function setSessionStatus(sessionId: string, status: string, waNumber?: string | null): Promise<void> {
  await db
    .update(waSessionTable)
    .set({
      status,
      ...(waNumber !== undefined ? { waNumber } : {}),
      ...(status === "connected" ? { qr: null, lastSeenAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(waSessionTable.id, sessionId));
}

export async function enqueue(
  tenantId: string,
  sessionId: string,
  action: "start_session" | "send" | "logout",
  payload?: Record<string, unknown>,
): Promise<boolean> {
  // Message quota — only real outbound messages (action "send") consume it; control
  // actions (start_session/logout) are free. Non-throwing so the WA flow degrades
  // gracefully: over-quota → skip the enqueue + return false (auto-reply stops mid-
  // reply, the manual draft send surfaces a 402). Unlimited plan / null limit passes.
  if (action === "send") {
    const ctx = { tenantId, userId: "wa", role: "member" as const };
    if (!(await tenantService.canConsume(ctx, "messages_max", 1))) return false;
    await db.insert(waOutboxTable).values({
      id: "wo_" + crypto.randomUUID(),
      tenantId,
      sessionId,
      action,
      payload: payload ?? null,
    });
    await tenantService.bumpUsage(ctx, "messages_max", 1);
    return true;
  }
  await db.insert(waOutboxTable).values({
    id: "wo_" + crypto.randomUUID(),
    tenantId,
    sessionId,
    action,
    payload: payload ?? null,
  });
  return true;
}

export type WaOutboxRow = typeof waOutboxTable.$inferSelect;

// Gateway: pull pending work. FIFO by createdAt so paced bubbles (seq 0,1,2…)
// arrive in order. Pass `sessionId` for the per-rep EXTENSION model so each rep's
// extension only pulls its own session's jobs; omit it for a central VPS gateway
// that holds every session.
export async function pollOutbox(limit = 50, sessionId?: string): Promise<WaOutboxRow[]> {
  const pending = eq(waOutboxTable.status, "pending");
  return db
    .select()
    .from(waOutboxTable)
    .where(sessionId ? and(pending, eq(waOutboxTable.sessionId, sessionId)) : pending)
    .orderBy(asc(waOutboxTable.createdAt))
    .limit(limit);
}
export async function ackOutbox(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.update(waOutboxTable).set({ status: "done" }).where(inArray(waOutboxTable.id, ids));
}

// Resolve a session back to its owner (for inbound attribution).
export async function ownerOfSession(sessionId: string): Promise<{ tenantId: string; userId: string } | null> {
  const s = await getSession(sessionId);
  if (!s) return null;
  return { tenantId: s.tenantId, userId: s.ownerType === "rep" ? s.ownerId : "platform" };
}

// Gateway auth — a single shared token the VPS gateway holds (env).
export function gatewayTokenOk(token: string | null): boolean {
  const expected = process.env.WA_GATEWAY_TOKEN;
  return Boolean(expected && token && token === expected);
}
