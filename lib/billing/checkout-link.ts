// Closing primitive (doc 35) — a one-time Stripe Checkout link for an ad-hoc
// amount (IDR), used to actually CLOSE: drop a "pay now" link into an outbound
// message. Null-safe: returns null when Stripe isn't configured, so callers
// degrade to a linkless message.

import { appBaseUrl, getStripe } from "./stripe";

export async function createCheckoutLink(opts: {
  productName: string;
  amountIdr: number;
  tenantId: string;
  contactId?: string;
  metadata?: Record<string, string>;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  if (!opts.amountIdr || opts.amountIdr <= 0) return null;

  const base = appBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "idr",
          product_data: { name: opts.productName },
          // IDR is a zero-decimal currency in Stripe → unit_amount is rupiah as-is.
          unit_amount: Math.round(opts.amountIdr),
        },
        quantity: 1,
      },
    ],
    metadata: {
      tenantId: opts.tenantId,
      ...(opts.contactId ? { contactId: opts.contactId } : {}),
      ...(opts.metadata ?? {}),
    },
    success_url: `${base}/settings/billing?pay=success`,
    cancel_url: `${base}/settings/billing?pay=cancel`,
  });
  return session.url;
}
