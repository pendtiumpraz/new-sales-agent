import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  tenantsTable,
  membershipsTable,
  aiUsageTable,
  sendJobTable,
  subscriptionTable,
  planTable,
  creditGrantTable,
} from "@/lib/db/schema";

// Cross-tenant rollup for the superadmin console (doc 26). The caller's ctx must
// have role 'superadmin' — the RLS policy escape (app.role='superadmin') then
// lets these tenant-scoped reads see ALL tenants' rows.
export async function adminOverview(ctx: TenantContext) {
  const raw = await withTenant(ctx, async (tx) => {
    const tenants = await tx.select().from(tenantsTable);
    const memberships = await tx.select({ tenantId: membershipsTable.tenantId }).from(membershipsTable);
    const usage = await tx
      .select({ tenantId: aiUsageTable.tenantId, tokensIn: aiUsageTable.tokensIn, tokensOut: aiUsageTable.tokensOut, cost: aiUsageTable.cost })
      .from(aiUsageTable);
    const sends = await tx.select({ tenantId: sendJobTable.tenantId }).from(sendJobTable);
    const subs = await tx.select().from(subscriptionTable);
    const plans = await tx.select().from(planTable);
    const grants = await tx.select({ tenantId: creditGrantTable.tenantId, tokens: creditGrantTable.tokens }).from(creditGrantTable);
    return { tenants, memberships, usage, sends, subs, plans, grants };
  });

  const members = new Map<string, number>();
  raw.memberships.forEach((m) => members.set(m.tenantId, (members.get(m.tenantId) ?? 0) + 1));
  const sendCount = new Map<string, number>();
  raw.sends.forEach((s) => sendCount.set(s.tenantId, (sendCount.get(s.tenantId) ?? 0) + 1));
  const ai = new Map<string, { calls: number; tokens: number; cost: number }>();
  raw.usage.forEach((u) => {
    const a = ai.get(u.tenantId) ?? { calls: 0, tokens: 0, cost: 0 };
    a.calls += 1;
    a.tokens += u.tokensIn + u.tokensOut;
    a.cost += u.cost;
    ai.set(u.tenantId, a);
  });
  const planById = new Map(raw.plans.map((p) => [p.id, p]));
  const subByTenant = new Map(raw.subs.map((s) => [s.tenantId, s]));
  const granted = new Map<string, number>();
  raw.grants.forEach((g) => granted.set(g.tenantId, (granted.get(g.tenantId) ?? 0) + (g.tokens ?? 0)));

  const tenants = raw.tenants.map((t) => {
    const sub = subByTenant.get(t.id);
    const plan = sub ? planById.get(sub.planId) : undefined;
    const planTokens = ((plan?.quotas as Record<string, number> | undefined)?.ai_tokens ?? 0) as number;
    const aiAgg = ai.get(t.id) ?? { calls: 0, tokens: 0, cost: 0 };
    const grantedTokens = granted.get(t.id) ?? 0;
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      plan: plan?.name ?? "—",
      seats: sub?.seats ?? null,
      members: members.get(t.id) ?? 0,
      sends: sendCount.get(t.id) ?? 0,
      ai: aiAgg,
      credit: {
        planTokens,
        granted: grantedTokens,
        balance: planTokens + grantedTokens - aiAgg.tokens,
      },
    };
  });

  const totals = tenants.reduce(
    (acc, t) => ({
      tenants: acc.tenants + 1,
      aiCalls: acc.aiCalls + t.ai.calls,
      aiCost: acc.aiCost + t.ai.cost,
      sends: acc.sends + t.sends,
    }),
    { tenants: 0, aiCalls: 0, aiCost: 0, sends: 0 },
  );

  return { tenants, totals };
}
