import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePermission } from "@/lib/rbac/guard";
import { sendWhatsApp, wahaConfigured } from "@/lib/wa/waha";
import { recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";

// POST /api/wa/send { to, text } (doc 34) → send one WhatsApp via WAHA. For
// manual / test sends; cadence WA steps go through the processor. campaign.manage.
const Body = z.object({ to: z.string().min(5), text: z.string().min(1) });

export async function POST(req: Request) {
  const guard = await requirePermission("campaign.manage");
  if ("error" in guard) return guard.error;

  if (!wahaConfigured()) {
    return NextResponse.json(
      { ok: false, error: "WAHA belum dikonfigurasi (WAHA_BASE_URL/WAHA_API_KEY)." },
      { status: 503 },
    );
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  try {
    const id = await sendWhatsApp(parsed.data);
    await recordAudit(guard.ctx, "wa.send", parsed.data.to, { id });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[api/wa/send]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
