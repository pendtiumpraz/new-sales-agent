import { NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { requirePermission } from "@/lib/rbac/guard";
import {
  aiProviderTable,
  aiModelTable,
  aiCredentialTable,
  tenantActiveModelTable,
  aiUsageTable,
} from "@/lib/db/schema";
import { platformKey } from "@/lib/ai/adapters";

export const runtime = "nodejs";

/** Start of the current month in Asia/Jakarta (UTC+7) as a UTC Date — the AI
 *  usage rollup windows to this so it shows the manageable current-month spend,
 *  not an ever-growing lifetime total. */
function jakartaMonthStart(now: Date = new Date()): Date {
  const j = new Date(now.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), 1, 0, 0, 0) - 7 * 3_600_000);
}

// GET /api/tenant/ai → catalog (global) + this tenant's active model, BYOK key
// status per provider, and usage rollup (doc 24).
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDb()) {
    return NextResponse.json({ models: [], providers: [], activeModelId: null, usage: null, source: "mock" });
  }
  try {
    const data = await withTenant(ctx, async (tx) => {
      const providers = await tx.select().from(aiProviderTable);
      const models = await tx.select().from(aiModelTable);
      const active = await tx
        .select()
        .from(tenantActiveModelTable)
        .where(eq(tenantActiveModelTable.tenantId, ctx.tenantId))
        .limit(1);
      const creds = await tx
        .select({ providerId: aiCredentialTable.providerId })
        .from(aiCredentialTable)
        .where(eq(aiCredentialTable.tenantId, ctx.tenantId));
      // Window to the current month so the rollup is manageable (not lifetime).
      const usageRows = await tx
        .select({ tokensIn: aiUsageTable.tokensIn, tokensOut: aiUsageTable.tokensOut, cost: aiUsageTable.cost })
        .from(aiUsageTable)
        .where(and(eq(aiUsageTable.tenantId, ctx.tenantId), gte(aiUsageTable.at, jakartaMonthStart())));
      return { providers, models, active, creds, usageRows };
    });

    const tenantCredProviders = new Set(data.creds.map((c) => c.providerId));
    const providers = data.providers.map((p) => ({
      id: p.id,
      key: p.key,
      displayName: p.displayName,
      hasPlatformKey: !!platformKey(p.key),
      hasTenantKey: tenantCredProviders.has(p.id),
    }));
    const usage = data.usageRows.reduce<{
      tokensIn: number;
      tokensOut: number;
      cost: number;
      calls: number;
    }>(
      (a, r) => ({
        tokensIn: a.tokensIn + r.tokensIn,
        tokensOut: a.tokensOut + r.tokensOut,
        cost: a.cost + Number(r.cost),
        calls: a.calls + 1,
      }),
      { tokensIn: 0, tokensOut: 0, cost: 0, calls: 0 },
    );

    return NextResponse.json({
      models: data.models,
      providers,
      activeModelId: data.active[0]?.modelId ?? null,
      usage,
      source: "db",
    });
  } catch (err) {
    console.error("[api/tenant/ai GET]", err);
    return NextResponse.json({ models: [], providers: [], activeModelId: null, usage: null, source: "error" });
  }
}

// PATCH /api/tenant/ai → set the tenant's one active model. Body { modelId }.
export async function PATCH(req: Request) {
  const guard = await requirePermission("tenant.settings.manage");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const body = (await req.json()) as { modelId?: string };
    if (!body?.modelId) return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
    await withTenant(ctx, (tx) =>
      tx
        .insert(tenantActiveModelTable)
        .values({ tenantId: ctx.tenantId, modelId: body.modelId! })
        .onConflictDoUpdate({
          target: tenantActiveModelTable.tenantId,
          set: { modelId: body.modelId!, updatedAt: new Date() },
        }),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/tenant/ai PATCH]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
