import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac/guard";
import { sendQuote } from "@/lib/quotes/store";

export const runtime = "nodejs";

// POST /api/quotes/<id>/send — send via the rep's sending account (existing mail queue).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("campaign.manage");
  if ("error" in guard) return guard.error;
  const body = (await req.json().catch(() => ({}))) as { sendingAccountId?: string; toEmail?: string };
  if (!body.sendingAccountId) return NextResponse.json({ error: "Pilih mailbox pengirim dulu" }, { status: 400 });
  const res = await sendQuote(guard.ctx, params.id, { sendingAccountId: body.sendingAccountId, toEmail: body.toEmail });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
