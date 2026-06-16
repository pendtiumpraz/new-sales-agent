import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db, hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import {
  subscriptionTable,
  planTable,
  aiUsageTable,
  sendJobTable,
  membershipsTable,
} from "@/lib/db/schema";
import { configuredPlanKeys, stripeConfigured } from "@/lib/billing/stripe";
import { creditEnforced, tenantCreditBalance } from "@/lib/billing/credit";

export const runtime = "nodejs";

// GET /api/tenant/billing → current plan + usage vs quota (doc 27).
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ source: "mock" });
  if (!hasDb()) return NextResponse.json({ source: "mock" });
  try {
    const data = await withTenant(ctx, async (tx) => {
      const sub = (await tx.select().from(subscriptionTable).where(eq(subscriptionTable.tenantId, ctx.tenantId)).limit(1))[0] ?? null;
      const plan = sub ? (await tx.select().from(planTable).where(eq(planTable.id, sub.planId)).limit(1))[0] ?? null : null;
      const usage = await tx
        .select({ tokensIn: aiUsageTable.tokensIn, tokensOut: aiUsageTable.tokensOut })
        .from(aiUsageTable)
        .where(eq(aiUsageTable.tenantId, ctx.tenantId));
      const sent = await tx
        .select({ id: sendJobTable.id })
        .from(sendJobTable)
        .where(and(eq(sendJobTable.tenantId, ctx.tenantId), eq(sendJobTable.status, "sent")));
      const members = await tx
        .select({ id: membershipsTable.id })
        .from(membershipsTable)
        .where(and(eq(membershipsTable.tenantId, ctx.tenantId), eq(membershipsTable.status, "active")));
      return { sub, plan, usage, sent, members };
    });

    const aiTokens = data.usage.reduce((n, u) => n + u.tokensIn + u.tokensOut, 0);
    const quotas = (data.plan?.quotas ?? {}) as Record<string, number>;

    // Plan catalog (global table, no RLS) + Stripe wiring flags for the upgrade UI.
    const allPlans = await db
      .select({ key: planTable.key, name: planTable.name, priceMonthIdr: planTable.priceMonthIdr })
      .from(planTable)
      .orderBy(planTable.priceMonthIdr);
    const purchasable = configuredPlanKeys();
    const credit = await tenantCreditBalance(ctx);

    return NextResponse.json({
      source: "db",
      plan: data.plan ? { name: data.plan.name, priceMonthIdr: data.plan.priceMonthIdr, quotas } : null,
      currentPlanKey: data.plan?.key ?? null,
      seats: data.sub?.seats ?? null,
      status: data.sub?.status ?? null,
      credit: { ...credit, enforced: creditEnforced() },
      usage: {
        aiTokens,
        aiTokensQuota: quotas.ai_tokens ?? null,
        emails: data.sent.length,
        emailsQuota: quotas.emails ?? null,
        members: data.members.length,
        seatsQuota: quotas.seats ?? data.sub?.seats ?? null,
      },
      billing: {
        stripeConfigured: stripeConfigured(),
        hasStripeSubscription: Boolean(data.sub?.stripeCustomerId),
        purchasablePlanKeys: purchasable,
        plans: allPlans,
      },
    });
  } catch (err) {
    console.error("[api/tenant/billing GET]", err);
    return NextResponse.json({ source: "error" });
  }
}
