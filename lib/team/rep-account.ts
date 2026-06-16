import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { repAccountTable } from "@/lib/db/schema";
import type { TenantContext } from "@/lib/db/tenant-context";

// Per-sales account + token (doc 41 §4). Token lookups are pre-auth / cross-
// tenant, so they use the raw `db` (like lib/auth) rather than withTenant.

export type RepAccount = typeof repAccountTable.$inferSelect;

function genToken(): string {
  return "rep_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

async function findOwn(ctx: TenantContext): Promise<RepAccount | undefined> {
  const [row] = await db
    .select()
    .from(repAccountTable)
    .where(and(eq(repAccountTable.tenantId, ctx.tenantId), eq(repAccountTable.userId, ctx.userId)))
    .limit(1);
  return row;
}

export async function getOrCreateRepAccount(ctx: TenantContext): Promise<RepAccount> {
  const existing = await findOwn(ctx);
  if (existing) return existing;
  await db
    .insert(repAccountTable)
    .values({ id: "rep_" + crypto.randomUUID(), tenantId: ctx.tenantId, userId: ctx.userId, token: genToken() })
    .onConflictDoNothing();
  return (await findOwn(ctx))!;
}

export async function updateRepAccount(
  ctx: TenantContext,
  patch: { linkedinUrl?: string | null; instagram?: string | null },
): Promise<RepAccount> {
  await getOrCreateRepAccount(ctx);
  await db
    .update(repAccountTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(repAccountTable.tenantId, ctx.tenantId), eq(repAccountTable.userId, ctx.userId)));
  return (await findOwn(ctx))!;
}

export async function regenerateToken(ctx: TenantContext): Promise<RepAccount> {
  await getOrCreateRepAccount(ctx);
  await db
    .update(repAccountTable)
    .set({ token: genToken(), updatedAt: new Date() })
    .where(and(eq(repAccountTable.tenantId, ctx.tenantId), eq(repAccountTable.userId, ctx.userId)));
  return (await findOwn(ctx))!;
}

// Pre-auth token resolution — used by /api/ingest + /api/extension/heartbeat to
// attribute crawled data to the owning rep.
export async function resolveRepByToken(token: string): Promise<RepAccount | null> {
  if (!token) return null;
  const [row] = await db.select().from(repAccountTable).where(eq(repAccountTable.token, token)).limit(1);
  return row ?? null;
}

export async function touchRepHeartbeat(token: string, version: string | null): Promise<RepAccount | null> {
  const rep = await resolveRepByToken(token);
  if (!rep) return null;
  await db
    .update(repAccountTable)
    .set({ lastSeenAt: new Date(), extVersion: version, updatedAt: new Date() })
    .where(eq(repAccountTable.id, rep.id));
  return rep;
}
