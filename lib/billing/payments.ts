// Payment provider abstraction for quota-pack purchases.
//
// The active gateway is a platform setting (`payment_provider`) the superadmin picks:
//   none    → self-serve INSTANT grant (demo / no real payment) — fully working.
//   midtrans → WIRED: Snap checkout (redirect) + webhook confirmation (below).
//   stripe | xendit | tripay → SCAFFOLDED: createCheckout throws a clear 501 until
//   each gateway's checkout + webhook is wired.
//
// Midtrans env (server-side only): MIDTRANS_SERVER_KEY (required), MIDTRANS_IS_PRODUCTION
// ("true" → production, else sandbox). We use the Snap `redirect_url` so no client key
// is needed on the frontend.
import { createHash } from "node:crypto";

import { getSecret } from "@/lib/config/secrets";
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
  orderId?: string; // required for gateway checkouts (ties the tx to a pending grant)
}
export interface CheckoutResult {
  mode: "instant" | "redirect";
  provider: PaymentProvider;
  url?: string; // gateway checkout URL (redirect mode)
  ref?: string; // gateway order/invoice id
}

/**
 * Start a checkout for a pack. `none` → instant (the caller grants the pack right
 * away). `midtrans` → a Snap transaction (redirect_url). Others are scaffolded (501).
 */
export async function createCheckout(provider: PaymentProvider, input: CheckoutInput): Promise<CheckoutResult> {
  if (provider === "none") return { mode: "instant", provider };
  if (provider === "midtrans") return midtransCheckout(input);
  // TODO(payments): stripe (Checkout Session) · xendit (Invoice) · tripay (signed tx).
  throw new ServiceError(
    `Gateway ${provider} belum dikonfigurasi (butuh API key + webhook). Sementara pakai mode instan atau minta superadmin top-up.`,
    501,
    "provider_not_configured",
  );
}

// ── Midtrans (Snap) ──────────────────────────────────────────────────────────
function midtransBase(): string {
  return /^true$/i.test(process.env.MIDTRANS_IS_PRODUCTION ?? "")
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

async function midtransCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const serverKey = await getSecret("MIDTRANS_SERVER_KEY");
  if (!serverKey) {
    throw new ServiceError(
      "Midtrans belum dikonfigurasi — set MIDTRANS_SERVER_KEY (+ MIDTRANS_IS_PRODUCTION) di env.",
      501,
      "provider_not_configured",
    );
  }
  if (!input.orderId) throw new ServiceError("orderId wajib untuk checkout gateway", 400, "validation");
  const amount = Math.round(input.amountIdr);
  const auth = Buffer.from(serverKey + ":").toString("base64");
  const res = await fetch(midtransBase() + "/snap/v1/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Basic " + auth },
    body: JSON.stringify({
      transaction_details: { order_id: input.orderId, gross_amount: amount },
      item_details: [{ id: input.packKey, price: amount, quantity: 1, name: input.label.slice(0, 50) }],
      credit_card: { secure: true },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    redirect_url?: string;
    token?: string;
    error_messages?: string[];
  };
  if (!res.ok || !data.redirect_url) {
    throw new ServiceError(
      `Midtrans gagal membuat transaksi: ${data.error_messages?.join(", ") || "HTTP " + res.status}`,
      502,
      "gateway_error",
    );
  }
  return { mode: "redirect", provider: "midtrans", url: data.redirect_url, ref: input.orderId };
}

// Webhook helpers — verify Midtrans notification authenticity + read paid state.
export interface MidtransNotification {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  fraud_status?: string;
}

/** Midtrans signature = sha512(order_id + status_code + gross_amount + serverKey). */
export function verifyMidtransSignature(n: MidtransNotification): boolean {
  const serverKey = process.env.MIDTRANS_SERVER_KEY ?? "";
  if (!serverKey || !n.order_id || !n.signature_key) return false;
  const expected = createHash("sha512")
    .update(`${n.order_id}${n.status_code ?? ""}${n.gross_amount ?? ""}${serverKey}`)
    .digest("hex");
  return expected === n.signature_key;
}

/** Paid = settlement, or capture that wasn't flagged as fraud. */
export function midtransIsPaid(n: MidtransNotification): boolean {
  if (n.transaction_status === "capture") return n.fraud_status !== "deny";
  return n.transaction_status === "settlement";
}
