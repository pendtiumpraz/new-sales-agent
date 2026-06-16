// Stripe billing scaffold (doc 30).
//
// Everything here is NULL-SAFE: with no STRIPE_SECRET_KEY the helpers report
// "not configured" and the app keeps running on the existing demo billing data.
// So this ships inert — fill the env keys (see docs/30-stripe-billing.md) and it
// turns on with no code changes.

import Stripe from "stripe";

let _stripe: Stripe | null | undefined;

/** Lazily build a Stripe client, or null when STRIPE_SECRET_KEY is unset. */
export function getStripe(): Stripe | null {
  if (_stripe !== undefined) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  // apiVersion omitted → the SDK uses the account's default pinned version.
  _stripe = key ? new Stripe(key) : null;
  return _stripe;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// plan.key (starter | growth | enterprise) → Stripe recurring Price id, via env.
// Fill these with the Price ids from your Stripe dashboard (Products → Pricing).
const PRICE_ENV: Record<string, string> = {
  starter: "STRIPE_PRICE_STARTER",
  growth: "STRIPE_PRICE_GROWTH",
  enterprise: "STRIPE_PRICE_ENTERPRISE",
};

/** Stripe Price id configured for a plan key, or null when not set. */
export function priceIdForPlan(planKey: string): string | null {
  const envName = PRICE_ENV[planKey];
  return envName ? process.env[envName] ?? null : null;
}

/** Reverse lookup: which plan key a Stripe Price id maps to (for webhooks). */
export function planKeyForPrice(priceId: string): string | null {
  for (const [planKey, envName] of Object.entries(PRICE_ENV)) {
    const v = process.env[envName];
    if (v && v === priceId) return planKey;
  }
  return null;
}

/** Plan keys that have a Price id configured (drives which upgrade buttons show). */
export function configuredPlanKeys(): string[] {
  return Object.keys(PRICE_ENV).filter((k) => Boolean(priceIdForPlan(k)));
}

/** Absolute base url for Stripe redirect (success/cancel/return) urls. */
export function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/** Map a Stripe subscription.status onto our subscription.status enum. */
export function mapStripeStatus(s: string): string {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid") return "past_due";
  return "canceled"; // canceled | incomplete | incomplete_expired | paused
}
