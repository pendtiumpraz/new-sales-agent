import { NextResponse } from "next/server";

import { verifyMidtransSignature, midtransIsPaid, type MidtransNotification } from "@/lib/billing/payments";
import { tenantService } from "@/modules/tenant/service";

export const runtime = "nodejs";

// POST /api/billing/webhook/midtrans — Midtrans HTTP notification.
//
// Public (Midtrans calls it, no session) but AUTHENTICATED by the sha512 signature
// (order_id + status_code + gross_amount + serverKey). On a paid status we flip the
// matching PENDING quota_grant to active (activatePurchase is idempotent). We always
// return 200 on a valid signature so Midtrans stops retrying. Set the notification
// URL in the Midtrans dashboard to <app>/api/billing/webhook/midtrans.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as MidtransNotification | null;
  if (!body?.order_id) return NextResponse.json({ ok: false, error: "bad payload" }, { status: 400 });
  if (!verifyMidtransSignature(body)) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 403 });
  }
  try {
    if (midtransIsPaid(body)) {
      await tenantService.activatePurchase(body.order_id);
    }
  } catch (err) {
    // A transient error shouldn't make Midtrans hammer us — 200 and let the next
    // notification (or a manual replay) retry activation.
    console.error("[midtrans webhook]", err);
  }
  return NextResponse.json({ ok: true });
}
