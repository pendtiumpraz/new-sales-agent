// Buyable top-up packs. Each pack adds `amount` to a metric's ceiling for `days`
// (30-day packs by default). Purchased via /api/billing/quota/buy (instant in demo,
// or through the configured payment gateway once wired). Prices in IDR.
import type { QuotaMetric } from "./plans";

export interface QuotaPack {
  key: string;
  metric: QuotaMetric;
  amount: number;
  days: number;
  priceIdr: number;
  label: string;
}

export const QUOTA_PACKS: QuotaPack[] = [
  { key: "msg_1k", metric: "messages_max", amount: 1_000, days: 30, priceIdr: 49_000, label: "+1.000 pesan WA (30 hari)" },
  { key: "msg_5k", metric: "messages_max", amount: 5_000, days: 30, priceIdr: 199_000, label: "+5.000 pesan WA (30 hari)" },
  { key: "ai_1m", metric: "ai_tokens_max", amount: 1_000_000, days: 30, priceIdr: 99_000, label: "+1 juta token AI (30 hari)" },
  { key: "ai_5m", metric: "ai_tokens_max", amount: 5_000_000, days: 30, priceIdr: 399_000, label: "+5 juta token AI (30 hari)" },
  { key: "contacts_5k", metric: "contacts_max", amount: 5_000, days: 30, priceIdr: 149_000, label: "+5.000 kontak (30 hari)" },
  { key: "companies_2k", metric: "companies_max", amount: 2_000, days: 30, priceIdr: 129_000, label: "+2.000 perusahaan (30 hari)" },
  { key: "seats_5", metric: "seats_max", amount: 5, days: 30, priceIdr: 299_000, label: "+5 seat (30 hari)" },
];

export function packByKey(key: string): QuotaPack | undefined {
  return QUOTA_PACKS.find((p) => p.key === key);
}
