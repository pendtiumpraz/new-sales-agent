import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePermission } from "@/lib/rbac/guard";
import { createCheckoutLink } from "@/lib/billing/checkout-link";
import { stripeConfigured } from "@/lib/billing/stripe";
import { recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";

// POST /api/billing/payment-link { productName, amountIdr, contactId? } (doc 35) →
// a one-time Stripe Checkout url to close a sale manually. tenant.billing-guarded.
const Body = z.object({
  productName: z.string().min(1),
  amountIdr: z.number().int().positive(),
  contactId: z.string().optional(),
});

export async function POST(req: Request) {
  const guard = await requirePermission("tenant.billing");
  if ("error" in guard) return guard.error;

  if (!stripeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Stripe belum dikonfigurasi (isi STRIPE_SECRET_KEY)." },
      { status: 503 },
    );
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  try {
    const url = await createCheckoutLink({
      productName: parsed.data.productName,
      amountIdr: parsed.data.amountIdr,
      tenantId: guard.ctx.tenantId,
      contactId: parsed.data.contactId,
      metadata: { kind: "close" },
    });
    if (!url) return NextResponse.json({ ok: false, error: "Gagal membuat link" }, { status: 500 });
    await recordAudit(guard.ctx, "billing.payment_link", parsed.data.productName, {
      amountIdr: parsed.data.amountIdr,
    });
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error("[api/billing/payment-link]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
