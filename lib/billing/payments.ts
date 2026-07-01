// Payment provider abstraction for quota-pack purchases.
//
// The active gateway is a platform setting (`payment_provider`) the superadmin picks:
//   none    → self-serve INSTANT grant (demo / no real payment) — fully working.
//   stripe | xendit | tripay | midtrans → real checkout — SCAFFOLDED: each needs its
//   own API key(s) + a webhook (/api/billing/webhook/<provider>) that flips a pending
//   quota_grant to active on payment success. Until those are wired, createCheckout
//   throws a clear 501 so callers can fall back to instant/superadmin.
import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";

export const PAYMENT_PROVIDERS = ["none", "stripe", "xendit", "tripay", "midtrans"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export async function getPaymentProvider(): Promise<PaymentProvider> {
  const s = await platformRepo.getSetting("payment_provider").catch(() => undefined);
  const v = (s?.value ?? "none") as PaymentProvider;
  return (PAYMENT_PROVIDERS as readonly string[]).includes(v) ? v : "none";
}

export async function setPaymentProvider(p: PaymentProvider): Promise<void> {
  if (!(PAYMENT_PROVIDERS as readonly string[]).includes(p)) {
    throw new ServiceError("Provider tidak valid", 400, "validation");
  }
  await platformRepo.setSetting("payment_provider", p);
}

export interface CheckoutInput {
  tenantId: string;
  packKey: string;
  amountIdr: number;
  label: string;
}
export interface CheckoutResult {
  mode: "instant" | "redirect";
  provider: PaymentProvider;
  url?: string; // gateway checkout URL (redirect mode)
  ref?: string; // gateway order/invoice id
}

/**
 * Start a checkout for a pack. `none` → instant (the caller grants the pack right
 * away). Real gateways are scaffolded — wiring one means: create a checkout via its
 * SDK/HTTP API here (returning {mode:"redirect", url, ref}), record a PENDING
 * quota_grant, then confirm it in a webhook. Throws 501 until that exists.
 */
export async function createCheckout(provider: PaymentProvider, input: CheckoutInput): Promise<CheckoutResult> {
  if (provider === "none") return { mode: "instant", provider };
  // TODO(payments): implement per-gateway checkout + webhook confirmation.
  //   stripe   → Checkout Session (stripe.checkout.sessions.create)
  //   xendit   → Invoice API
  //   tripay   → Transaction/Create (signed)
  //   midtrans → Snap transaction token
  throw new ServiceError(
    `Gateway ${provider} belum dikonfigurasi (butuh API key + webhook). Sementara pakai mode instan atau minta superadmin top-up.`,
    501,
    "provider_not_configured",
  );
}
