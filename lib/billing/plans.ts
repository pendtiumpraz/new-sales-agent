// Subscription plan catalog + quota resolution.
//
// This is the CANONICAL plan definition in code. The legacy `plan` table
// (lib/db/schema.ts) is a DB mirror seeded FROM this catalog (scripts/rebuild-
// demo-seed.mts). Quota metrics mirror the rebuild `usage_counter` table
// (modules/tenant/schema.ts). `null` on any metric = UNLIMITED for that metric.
//
// Enforcement resolves limits from HERE via the tenant's `plan_key` (source of
// truth), using `usage_counter` only for the per-period `used` counter — so a
// monthly metric naturally resets when the period key rolls over.

export type QuotaMetric =
  | "seats_max"
  | "contacts_max"
  | "companies_max"
  | "messages_max"
  | "ai_tokens_max";

export const QUOTA_METRICS: QuotaMetric[] = [
  "seats_max",
  "contacts_max",
  "companies_max",
  "messages_max",
  "ai_tokens_max",
];

// Metrics that reset each calendar month (period = 'YYYY-MM'). The rest are
// lifetime accumulators (period = 'lifetime').
export const MONTHLY_METRICS: QuotaMetric[] = ["messages_max", "ai_tokens_max"];

// Human labels for quota-exceeded messages + the extension/UI display.
export const METRIC_LABEL: Record<QuotaMetric, string> = {
  seats_max: "anggota tim",
  contacts_max: "kontak",
  companies_max: "perusahaan",
  messages_max: "pesan (bulan ini)",
  ai_tokens_max: "token AI (bulan ini)",
};

export interface PlanDef {
  key: string;
  name: string;
  priceMonthIdr: number;
  // null on a metric = unlimited for that metric.
  quotas: Record<QuotaMetric, number | null>;
}

const UNLIMITED: Record<QuotaMetric, number | null> = {
  seats_max: null,
  contacts_max: null,
  companies_max: null,
  messages_max: null,
  ai_tokens_max: null,
};

export const PLAN_CATALOG: PlanDef[] = [
  {
    key: "free",
    name: "Free",
    priceMonthIdr: 0,
    quotas: { seats_max: 1, contacts_max: 100, companies_max: 50, messages_max: 200, ai_tokens_max: 50_000 },
  },
  {
    key: "starter",
    name: "Starter",
    priceMonthIdr: 149_000,
    quotas: { seats_max: 3, contacts_max: 1_000, companies_max: 500, messages_max: 2_000, ai_tokens_max: 500_000 },
  },
  {
    key: "growth",
    name: "Growth",
    priceMonthIdr: 499_000,
    quotas: { seats_max: 10, contacts_max: 10_000, companies_max: 5_000, messages_max: 20_000, ai_tokens_max: 5_000_000 },
  },
  {
    key: "enterprise",
    name: "Enterprise",
    priceMonthIdr: 1_999_000,
    quotas: { seats_max: 50, contacts_max: 100_000, companies_max: 50_000, messages_max: 200_000, ai_tokens_max: 50_000_000 },
  },
  {
    key: "unlimited",
    name: "Unlimited",
    priceMonthIdr: 0,
    quotas: { ...UNLIMITED },
  },
];

export function planByKey(key: string | null | undefined): PlanDef | undefined {
  return key ? PLAN_CATALOG.find((p) => p.key === key) : undefined;
}

/**
 * Per-metric ceilings for a plan (`null` = unlimited). An UNKNOWN or unset plan
 * key resolves to UNLIMITED (fail-open) — so an existing tenant that was never
 * assigned a plan is never suddenly blocked; only a tenant explicitly put on a
 * limited plan gets limited.
 */
export function resolvePlanLimits(planKey: string | null | undefined): Record<QuotaMetric, number | null> {
  const p = planByKey(planKey);
  return p ? p.quotas : { ...UNLIMITED };
}

/** Period bucket for a metric: 'YYYY-MM' for monthly metrics, else 'lifetime'. */
export function metricPeriod(metric: QuotaMetric, now = new Date()): string {
  return MONTHLY_METRICS.includes(metric) ? now.toISOString().slice(0, 7) : "lifetime";
}
