import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { personTable, aiUsageTable, dealsTable } from "@/lib/db/schema";
import { listTenantMembers } from "@/lib/team/members";

export const runtime = "nodejs";

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// GET /api/team/monitoring (doc 41) — manager-only sales monitoring: per rep,
// leads owned + deals/closings + AI activity (active vs idle). Manager-gated via
// tenant.members.manage so reps can't see the whole team's numbers.
export async function GET() {
  const guard = await requirePermission("tenant.members.manage");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });

  try {
    const members = await listTenantMembers(ctx);
    const { persons, usage, deals } = await withTenant(ctx, async (tx) => {
      const persons = await tx.select({ assignedTo: personTable.assignedTo }).from(personTable);
      const usage = await tx
        .select({ userId: aiUsageTable.userId, at: aiUsageTable.at, cost: aiUsageTable.cost })
        .from(aiUsageTable);
      const deals = await tx
        .select({ owner: dealsTable.owner, stage: dealsTable.stage, value: dealsTable.value })
        .from(dealsTable);
      return { persons, usage, deals };
    });

    // index aggregates
    const leadsByUser = new Map<string, number>();
    for (const p of persons) if (p.assignedTo) leadsByUser.set(p.assignedTo, (leadsByUser.get(p.assignedTo) ?? 0) + 1);

    const aiByUser = new Map<string, { calls: number; cost: number; lastAt: number }>();
    for (const u of usage) {
      if (!u.userId) continue;
      const cur = aiByUser.get(u.userId) ?? { calls: 0, cost: 0, lastAt: 0 };
      cur.calls += 1;
      cur.cost += u.cost ?? 0;
      const t = u.at ? new Date(u.at as unknown as string).getTime() : 0;
      if (t > cur.lastAt) cur.lastAt = t;
      aiByUser.set(u.userId, cur);
    }

    // deals are attributed by owner NAME (deals.owner is free text in the demo)
    const dealsByName = new Map<string, { total: number; won: number; wonValue: number }>();
    for (const d of deals) {
      const key = (d.owner ?? "").toLowerCase();
      if (!key) continue;
      const cur = dealsByName.get(key) ?? { total: 0, won: 0, wonValue: 0 };
      cur.total += 1;
      if (d.stage === "tutup") {
        cur.won += 1;
        cur.wonValue += d.value ?? 0;
      }
      dealsByName.set(key, cur);
    }

    const now = Date.now();
    const data = members.map((m) => {
      const ai = aiByUser.get(m.userId);
      const dl = dealsByName.get(m.name.toLowerCase());
      const lastAt = ai?.lastAt ?? 0;
      return {
        ...m,
        leadsOwned: leadsByUser.get(m.userId) ?? 0,
        deals: dl?.total ?? 0,
        won: dl?.won ?? 0,
        wonValue: dl?.wonValue ?? 0,
        aiCalls: ai?.calls ?? 0,
        aiCost: ai?.cost ?? 0,
        lastActiveAt: lastAt ? new Date(lastAt).toISOString() : null,
        active: lastAt > 0 && now - lastAt < ACTIVE_WINDOW_MS,
      };
    });

    // managers/owners first, then by leads owned
    data.sort((a, b) => b.leadsOwned - a.leadsOwned);
    return NextResponse.json({ data, source: "db" });
  } catch (err) {
    console.error("[api/team/monitoring GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}
