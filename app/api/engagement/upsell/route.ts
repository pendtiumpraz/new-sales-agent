import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { recentEngagementEvents, runUpsell } from "@/lib/engagement/upsell";
import { recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Autonomous upsell + close (doc 35).
//   GET  → recent engagement events (newest first)
//   POST → run upsell now (KB-driven offer + Stripe close link → email/WA)
export async function GET() {
  const guard = await requirePermission("campaign.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });
  try {
    const data = await recentEngagementEvents(guard.ctx, 30);
    return NextResponse.json({ data, source: "db" });
  } catch (err) {
    console.error("[api/engagement/upsell GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}

export async function POST() {
  const guard = await requirePermission("campaign.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const summary = await runUpsell(guard.ctx);
    await recordAudit(
      guard.ctx,
      "engagement.upsell",
      "all",
      summary as unknown as Record<string, unknown>,
    );
    return NextResponse.json({ ok: true, summary, source: "db" });
  } catch (err) {
    console.error("[api/engagement/upsell POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
