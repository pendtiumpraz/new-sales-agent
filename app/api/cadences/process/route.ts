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

export async function POST(req: Request) {
  const guard = await requirePermission("campaign.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    // Scope the run to a workspace when the caller is filtered to one (doc 44),
    // so "Jalankan sekarang" doesn't blast every workspace's enrollments.
    const workspaceId = new URL(req.url).searchParams.get("workspace");
    const summary = await processCadences(guard.ctx, { workspaceId });
    await recordAudit(
      guard.ctx,
      "cadence.process",
      workspaceId ? `workspace:${workspaceId}` : "all",
      summary as unknown as Record<string, unknown>,
    );
    return NextResponse.json({ ok: true, summary, source: "db" });
  } catch (err) {
    console.error("[api/cadences/process POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
