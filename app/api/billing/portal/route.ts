import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { subscriptionTable } from "@/lib/db/schema";
import { appBaseUrl, getStripe } from "@/lib/billing/stripe";

export const runtime = "nodejs";

// POST /api/billing/portal → Stripe billing portal url (doc 30) so a tenant can
// manage / cancel their subscription + see invoices. tenant.billing-guarded.
export async function POST() {
  const guard = await requirePermission("tenant.billing");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { ok: false, error: "Stripe belum dikonfigurasi (isi STRIPE_SECRET_KEY)." },
      { status: 503 },
    );
  }
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "DB belum aktif" }, { status: 503 });
  }

  try {
    const [sub] = await withTenant(ctx, (tx) =>
      tx.select().from(subscriptionTable).where(eq(subscriptionTable.tenantId, ctx.tenantId)).limit(1),
    );
    if (!sub?.stripeCustomerId) {
      return NextResponse.json(
        { ok: false, error: "Belum ada langganan Stripe untuk tenant ini." },
        { status: 400 },
      );
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appBaseUrl()}/settings/billing`,
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("[api/billing/portal]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
