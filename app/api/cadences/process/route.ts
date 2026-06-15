import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { processCadences, recentStepRuns } from "@/lib/cadence/processor";
import { recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Cadence multi-channel runner (Fase 5 slice 2, doc 22/23).
//   GET  → recent step-run log (newest first)
//   POST → process all due enrollments now (personalize + dispatch + advance)
// Process-on-demand for now; an Inngest cron can call the same engine later.

export async function GET() {
  const guard = await requirePermission("campaign.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });
  try {
    const data = await recentStepRuns(guard.ctx, 50);
    return NextResponse.json({ data, source: "db" });
  } catch (err) {
    console.error("[api/cadences/process GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}

export async function POST() {
  const guard = await requirePermission("campaign.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const summary = await processCadences(guard.ctx);
    await recordAudit(
      guard.ctx,
      "cadence.process",
      "all",
      summary as unknown as Record<string, unknown>,
    );
    return NextResponse.json({ ok: true, summary, source: "db" });
  } catch (err) {
    console.error("[api/cadences/process POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
