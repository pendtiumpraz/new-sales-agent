import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { loadTenantOutcomes } from "@/lib/sales/outcome-store";
import { computeCalibration, computeTrend } from "@/lib/sales/calibration";

export const runtime = "nodejs";

// GET /api/sales/calibration → per-band empirical close rate + weekly win-rate
// trend for the tenant, from recorded outcomes (G7). Powers the readiness badge
// annotation and the Reports calibration dashboard.
export async function GET(req: Request) {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) {
    return NextResponse.json({ calibration: computeCalibration([]), trend: [], source: "mock" });
  }
  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  let records = await loadTenantOutcomes(guard.ctx.tenantId);
  if (workspaceId) records = records.filter((r) => r.workspaceId === workspaceId);
  return NextResponse.json({ calibration: computeCalibration(records), trend: computeTrend(records) });
}
