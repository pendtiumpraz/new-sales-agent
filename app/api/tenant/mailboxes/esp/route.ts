import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { sendingAccountTable } from "@/lib/db/schema";
import { espConfigured } from "@/lib/mail/esp";
import { recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";

// POST /api/tenant/mailboxes/esp { fromEmail, fromName?, dailyLimit? } (doc 33) —
// create a platform-ESP sending identity. No per-account secret (uses the
// platform RESEND_API_KEY); fromEmail must sit on the platform's verified domain.
export async function POST(req: Request) {
  const guard = await requirePermission("mailbox.connect");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  if (!espConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Platform ESP belum dikonfigurasi (RESEND_API_KEY)." },
      { status: 503 },
    );
  }
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  try {
    const b = (await req.json()) as { fromEmail?: string; fromName?: string; dailyLimit?: number };
    if (!b?.fromEmail) {
      return NextResponse.json({ error: "fromEmail wajib" }, { status: 400 });
    }
    await withTenant(ctx, (tx) =>
      tx.insert(sendingAccountTable).values({
        id: "mbx_" + crypto.randomUUID(),
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        type: "platform_esp",
        fromEmail: b.fromEmail!.toLowerCase(),
        fromName: b.fromName ?? null,
        configEnc: null,
        dailyLimit: b.dailyLimit ?? 500,
      }),
    );
    await recordAudit(ctx, "mailbox.connect", "platform_esp", { fromEmail: b.fromEmail });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/tenant/mailboxes/esp]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
