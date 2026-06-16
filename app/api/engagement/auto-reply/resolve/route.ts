import { NextResponse } from "next/server";
import { z } from "zod";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { resolveEscalation } from "@/lib/engagement/autoreply";
import { recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";

// POST /api/engagement/auto-reply/resolve { eventId, action, reply? } (doc 36) —
// human resolves an escalated auto-reply: send the (optionally edited) reply, or
// dismiss it. campaign.manage-guarded.
const Body = z.object({
  eventId: z.string().min(1),
  action: z.enum(["send", "dismiss"]),
  reply: z.string().optional(),
});

export async function POST(req: Request) {
  const guard = await requirePermission("campaign.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  try {
    const res = await resolveEscalation(
      guard.ctx,
      parsed.data.eventId,
      parsed.data.action,
      parsed.data.reply,
    );
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    await recordAudit(guard.ctx, `auto_reply.${parsed.data.action}`, parsed.data.eventId, {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/engagement/auto-reply/resolve]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
