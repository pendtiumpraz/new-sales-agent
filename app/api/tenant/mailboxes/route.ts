import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { requirePermission } from "@/lib/rbac/guard";
import { sendingAccountTable } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/ai/crypto";
import { mailProviderConfigured } from "@/lib/mail/oauth";
import { espConfigured } from "@/lib/mail/esp";

export const runtime = "nodejs";

// Which OAuth providers + platform ESP are wired (keys in env) — drives the
// connect buttons in the UI. Inert when unset.
function oauthFlags() {
  return {
    google: mailProviderConfigured("google"),
    microsoft: mailProviderConfigured("microsoft"),
    esp: espConfigured(),
  };
}

// GET /api/tenant/mailboxes → the tenant's sending identities (no secrets).
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ data: [], oauth: oauthFlags(), source: "mock" });
  if (!hasDb()) return NextResponse.json({ data: [], oauth: oauthFlags(), source: "mock" });
  try {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({
          id: sendingAccountTable.id,
          type: sendingAccountTable.type,
          fromEmail: sendingAccountTable.fromEmail,
          fromName: sendingAccountTable.fromName,
          status: sendingAccountTable.status,
          dailyLimit: sendingAccountTable.dailyLimit,
          sentToday: sendingAccountTable.sentToday,
        })
        .from(sendingAccountTable)
        .where(eq(sendingAccountTable.tenantId, ctx.tenantId)), // RLS is off — scope explicitly
    );
    return NextResponse.json({ data: rows, oauth: oauthFlags(), source: "db" });
  } catch (err) {
    console.error("[api/tenant/mailboxes GET]", err);
    return NextResponse.json({ data: [], oauth: oauthFlags(), source: "error" });
  }
}

// POST /api/tenant/mailboxes → connect an SMTP mailbox (config encrypted).
// Body { fromEmail, fromName?, host, port, secure, user, pass, dailyLimit? }.
export async function POST(req: Request) {
  const guard = await requirePermission("mailbox.connect");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const b = (await req.json()) as {
      fromEmail?: string;
      fromName?: string;
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      pass?: string;
      dailyLimit?: number;
    };
    if (!b?.fromEmail || !b?.host || !b?.user || !b?.pass) {
      return NextResponse.json({ error: "Missing fromEmail/host/user/pass" }, { status: 400 });
    }
    const configEnc = encryptSecret(
      JSON.stringify({ host: b.host, port: b.port ?? 465, secure: b.secure ?? true, user: b.user, pass: b.pass }),
    );
    await withTenant(ctx, (tx) =>
      tx.insert(sendingAccountTable).values({
        id: "mbx_" + crypto.randomUUID(),
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        type: "smtp",
        fromEmail: b.fromEmail!.toLowerCase(),
        fromName: b.fromName ?? null,
        configEnc,
        dailyLimit: b.dailyLimit ?? 200,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/tenant/mailboxes POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// DELETE /api/tenant/mailboxes → remove a mailbox. Body { id }.
export async function DELETE(req: Request) {
  const guard = await requirePermission("mailbox.connect");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const b = (await req.json()) as { id?: string };
    if (!b?.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await withTenant(ctx, (tx) =>
      tx.delete(sendingAccountTable).where(and(eq(sendingAccountTable.tenantId, ctx.tenantId), eq(sendingAccountTable.id, b.id!))),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/tenant/mailboxes DELETE]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
