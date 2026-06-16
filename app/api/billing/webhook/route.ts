import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { db, hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { planTable, subscriptionTable } from "@/lib/db/schema";
import { getStripe, mapStripeStatus, planKeyForPrice } from "@/lib/billing/stripe";

export const runtime = "nodejs";

// POST /api/billing/webhook — Stripe → us (doc 30). PUBLIC (no session); the
// Stripe signature is the auth. The RAW body is required for verification, so we
// must NOT JSON-parse before constructEvent. Configure the endpoint + signing
// secret (STRIPE_WEBHOOK_SECRET) in the Stripe dashboard / `stripe listen`.

function strId(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

/** Resolve a plan key → our internal plan.id (plan table is global, no RLS). */
async function planIdForKey(planKey: string | null | undefined): Promise<string | undefined> {
  if (!planKey) return undefined;
  const [plan] = await db.select().from(planTable).where(eq(planTable.key, planKey)).limit(1);
  return plan?.id;
}

interface SubPatch {
  planKey?: string | null;
  status?: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

/** Upsert the tenant's subscription row. Uses a superadmin ctx so the write is
 *  allowed once RLS is enforced (the policy lets app.role=superadmin through). */
async function upsertSubscription(tenantId: string, patch: SubPatch) {
  const sysCtx = { tenantId, userId: "stripe-webhook", role: "superadmin" as const };
  const planId = await planIdForKey(patch.planKey);

  await withTenant(sysCtx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(subscriptionTable)
      .where(eq(subscriptionTable.tenantId, tenantId))
      .limit(1);

    if (existing) {
      await tx
        .update(subscriptionTable)
        .set({
          ...(planId ? { planId } : {}),
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.stripeCustomerId !== undefined ? { stripeCustomerId: patch.stripeCustomerId } : {}),
          ...(patch.stripeSubscriptionId !== undefined ? { stripeSubscriptionId: patch.stripeSubscriptionId } : {}),
        })
        .where(eq(subscriptionTable.tenantId, tenantId));
    } else {
      await tx.insert(subscriptionTable).values({
        id: "sub_" + crypto.randomUUID(),
        tenantId,
        planId: planId ?? "",
        status: patch.status ?? "active",
        stripeCustomerId: patch.stripeCustomerId ?? null,
        stripeSubscriptionId: patch.stripeSubscriptionId ?? null,
      });
    }
  });
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const tenantId = s.client_reference_id ?? s.metadata?.tenantId;
      if (!tenantId) return;
      await upsertSubscription(tenantId, {
        planKey: s.metadata?.planKey ?? null,
        status: "active",
        stripeCustomerId: strId(s.customer),
        stripeSubscriptionId: strId(s.subscription),
      });
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) return;
      const priceId = sub.items?.data?.[0]?.price?.id ?? null;
      await upsertSubscription(tenantId, {
        planKey: priceId ? planKeyForPrice(priceId) : null,
        status: mapStripeStatus(sub.status),
        stripeCustomerId: strId(sub.customer),
        stripeSubscriptionId: sub.id,
      });
      return;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) return;
      await upsertSubscription(tenantId, { status: "canceled" });
      return;
    }
    default:
      // Unhandled event types are acknowledged (200) so Stripe stops retrying.
      return;
  }
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json(
      { error: "Stripe webhook belum dikonfigurasi (STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET)." },
      { status: 503 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  // Raw body — verification fails if the body is re-serialized.
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error("[stripe webhook] signature verify failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!hasDb()) return NextResponse.json({ received: true, note: "no db" });

  try {
    await handleEvent(event);
  } catch (err) {
    console.error("[stripe webhook] handler error:", err);
    // 500 → Stripe retries with backoff.
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
