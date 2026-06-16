// AI credit system (doc 37). A tenant's AI-token balance =
//   plan allowance (plan.quotas.ai_tokens) + SUM(credit_grant) - consumed (ai_usage).
// Superadmin tops up via grantCredit. Enforcement is OPT-IN (CREDIT_ENFORCED=1):
// when on, the meter blocks AI calls once the balance hits zero. Default off →
// balance is tracked + shown but never blocks (so the demo keeps working).

import { eq } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { aiUsageTable, creditGrantTable, planTable, subscriptionTable } from "@/lib/db/schema";

export function creditEnforced(): boolean {
  return process.env.CREDIT_ENFORCED === "1" || process.env.CREDIT_ENFORCED === "true";
}

export interface CreditBalance {
  planTokens: number;
  granted: number;
  consumed: number;
  balance: number;
}

/** Compute a single tenant's AI-token balance. */
export async function tenantCreditBalance(ctx: TenantContext): Promise<CreditBalance> {
  return withTenant(ctx, async (tx) => {
    const grants = await tx.select({ tokens: creditGrantTable.tokens }).from(creditGrantTable);
    const granted = grants.reduce((n, g) => n + (g.tokens ?? 0), 0);

    const usage = await tx
      .select({ i: aiUsageTable.tokensIn, o: aiUsageTable.tokensOut })
      .from(aiUsageTable);
    const consumed = usage.reduce((n, u) => n + (u.i ?? 0) + (u.o ?? 0), 0);

    const [sub] = await tx
      .select()
      .from(subscriptionTable)
      .where(eq(subscriptionTable.tenantId, ctx.tenantId))
      .limit(1);
    let planTokens = 0;
    if (sub) {
      const [plan] = await tx.select().from(planTable).where(eq(planTable.id, sub.planId)).limit(1);
      planTokens = ((plan?.quotas as Record<string, number>)?.ai_tokens ?? 0) as number;
    }

    return { planTokens, granted, consumed, balance: planTokens + granted - consumed };
  });
}

/** Superadmin grants (or revokes, with a negative amount) AI-token credit. */
export async function grantCredit(
  superCtx: TenantContext,
  tenantId: string,
  tokens: number,
  reason?: string,
): Promise<void> {
  // superadmin role → RLS escape lets us write to any tenant.
  const ctx: TenantContext = { tenantId, userId: superCtx.userId, role: "superadmin" };
  await withTenant(ctx, (tx) =>
    tx.insert(creditGrantTable).values({
      id: "cg_" + crypto.randomUUID(),
      tenantId,
      tokens: Math.round(tokens),
      reason: reason ?? null,
      grantedBy: superCtx.userId,
    }),
  );
}
