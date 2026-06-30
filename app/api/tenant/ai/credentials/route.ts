import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { aiCredentialTable } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/ai/crypto";

export const runtime = "nodejs";

// POST /api/tenant/ai/credentials → add/replace a tenant BYOK key (encrypted) for
// a provider. Body { providerId, apiKey, label? }. Requires tenant.settings.manage.
export async function POST(req: Request) {
  const guard = await requirePermission("tenant.settings.manage");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const body = (await req.json()) as { providerId?: string; apiKey?: string; label?: string };
    if (!body?.providerId || !body?.apiKey) {
      return NextResponse.json({ error: "Missing providerId or apiKey" }, { status: 400 });
    }
    const enc = encryptSecret(body.apiKey);
    await withTenant(ctx, (tx) =>
      tx
        .insert(aiCredentialTable)
        .values({
          id: "cred_" + crypto.randomUUID(),
          tenantId: ctx.tenantId,
          providerId: body.providerId!,
          apiKeyEnc: enc,
          label: body.label ?? null,
          source: "tenant",
        })
        .onConflictDoUpdate({
          target: [aiCredentialTable.tenantId, aiCredentialTable.providerId],
          set: { apiKeyEnc: enc, label: body.label ?? null },
        }),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/tenant/ai/credentials POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

// DELETE /api/tenant/ai/credentials → remove a tenant BYOK key. Body { providerId }.
export async function DELETE(req: Request) {
  const guard = await requirePermission("tenant.settings.manage");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const body = (await req.json()) as { providerId?: string };
    if (!body?.providerId) return NextResponse.json({ error: "Missing providerId" }, { status: 400 });
    await withTenant(ctx, (tx) =>
      tx
        .delete(aiCredentialTable)
        .where(and(eq(aiCredentialTable.tenantId, ctx.tenantId), eq(aiCredentialTable.providerId, body.providerId!))),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/tenant/ai/credentials DELETE]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
