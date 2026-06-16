import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { recentAutoReplyEvents, runAutoReply } from "@/lib/engagement/autoreply";
import { recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Autonomous auto-reply + escalation (doc 36).
//   GET  → recent decisions (escalations = the human review queue)
//   POST → run now: draft + judge inbound conversations, auto-send or escalate
export async function GET() {
  const guard = await requirePermission("campaign.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });
  try {
    const data = await recentAutoReplyEvents(guard.ctx, 30);
    return NextResponse.json({ data, source: "db" });
  } catch (err) {
    console.error("[api/engagement/auto-reply GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}

export async function POST() {
  const guard = await requirePermission("campaign.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const summary = await runAutoReply(guard.ctx);
    await recordAudit(
      guard.ctx,
      "engagement.auto_reply",
      "all",
      summary as unknown as Record<string, unknown>,
    );
    return NextResponse.json({ ok: true, summary, source: "db" });
  } catch (err) {
    console.error("[api/engagement/auto-reply POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
