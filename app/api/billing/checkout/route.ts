import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { subscriptionTable } from "@/lib/db/schema";
import {
  appBaseUrl,
  getStripe,
  priceIdForPlan,
  stripeConfigured,
} from "@/lib/billing/stripe";
import { recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";

// POST /api/billing/checkout { planKey } → Stripe Checkout session url (doc 30).
// Hosted Checkout: returns a url the client redirects to; the webhook syncs the
// subscription on completion. tenant.billing-guarded (tenant_owner/superadmin).
const Body = z.object({ planKey: z.string().min(1) });

export async function POST(req: Request) {
  // Recovery endpoint: a suspended/expired tenant must reach billing to pay /
  // reactivate, so it opts out of the tenant-active gate (audit #6).
  const guard = await requirePermission("tenant.billing", { allowInactiveTenant: true });
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const stripe = getStripe();
  if (!stripe || !stripeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Stripe belum dikonfigurasi (isi STRIPE_SECRET_KEY)." },
      { status: 503 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  const { planKey } = parsed.data;

  const priceId = priceIdForPlan(planKey);
  if (!priceId) {
    return NextResponse.json(
      { ok: false, error: `Price id belum diset untuk plan "${planKey}" (isi STRIPE_PRICE_${planKey.toUpperCase()}).` },
      { status: 400 },
    );
  }
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "DB belum aktif" }, { status: 503 });
  }

  try {
    // Reuse the tenant's Stripe customer if one already exists.
    const [sub] = await withTenant(ctx, (tx) =>
      tx.select().from(subscriptionTable).where(eq(subscriptionTable.tenantId, ctx.tenantId)).limit(1),
    );
    const base = appBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(sub?.stripeCustomerId ? { customer: sub.stripeCustomerId } : {}),
      // tenantId travels on both the session and the subscription so every
      // downstream webhook can resolve the tenant without a DB lookup.
      client_reference_id: ctx.tenantId,
      metadata: { tenantId: ctx.tenantId, planKey },
      subscription_data: { metadata: { tenantId: ctx.tenantId, planKey } },
      success_url: `${base}/settings/billing?checkout=success`,
      cancel_url: `${base}/settings/billing?checkout=cancel`,
    });

    await recordAudit(ctx, "billing.checkout", planKey, { sessionId: session.id });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("[api/billing/checkout]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
