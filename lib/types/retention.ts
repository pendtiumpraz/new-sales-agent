// Retention & After-Sales types (Wave 2D) — local to the retention module.
// Do NOT add these to lib/types.ts (other agents own it). Reference shared
// types from "@/lib/types" instead.

/** The three retention flow archetypes from feature-revisions.md §6. */
export type RetentionFlowType = "repeat-order" | "upsell" | "after-sales";

/** Lifecycle state for a retention flow. */
export type RetentionStatus = "aktif" | "jeda" | "draft";

/** Channels supported for retention steps (subset of messaging channels). */
export type RetentionStepChannel = "whatsapp" | "email" | "sms";

/**
 * A single step inside a retention flow — modeled after CadenceStep but kept
 * separate so retention can evolve independently (e.g. NPS questions).
 */
export interface RetentionStep {
  id: string;
  channel: RetentionStepChannel;
  /** Days to wait before sending this step (0 = immediate). */
  delayDays: number;
  /** Email subject (only when channel === "email"). */
  subject?: string;
  /** Message body — supports {{nama}}, {{perusahaan}}, {{produk}} variables. */
  content: string;
}

/**
 * A retention flow — a trigger-based sequence tied to a client's KB.
 *
 * `kbFlowId` is an opaque reference to KB.retention_flows owned by Agent B —
 * we never import their types, just store the id for downstream linking.
 */
export interface RetentionFlow {
  id: string;
  name: string;
  type: RetentionFlowType;
  status: RetentionStatus;
  description: string;
  /** Optional reference to KB.retention_flows (Agent B). */
  kbFlowId?: string;
  /** Number of contacts currently enrolled. */
  enrolled: number;
  /** Conversion rate of enrolled → desired outcome, 0–100. */
  conversionRate: number;
  steps: RetentionStep[];
  /** Optional product segment this flow targets (e.g. "UMKM"). */
  segmentTarget?: string;
  /** Human-readable trigger summary (e.g. "30 hari sejak pembelian terakhir"). */
  triggerCondition: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A customer ready for re-engagement — the "Daftar kandidat" table on the
 * retention dashboard.
 */
export interface RetentionCandidate {
  /** Refers to an existing Contact in the shared mock data (read-only). */
  contactId: string;
  contactName: string;
  company: string;
  /** ISO timestamp of the last completed purchase. */
  lastPurchase: string;
  daysSincePurchase: number;
  recommendedFlowId: string;
  recommendedFlowName: string;
  /** Short AI rationale shown next to the recommendation. */
  aiNote: string;
}

/** KPI tiles on the retention dashboard. */
export interface RetentionKpi {
  activeCustomers: number;
  /** Trend vs. previous period, in % (positive = growing). */
  activeCustomersTrend: number;
  repeatOrdersThisMonth: number;
  /** Total IDR value of repeat orders this month. */
  repeatOrderValueIDR: number;
  /** Upsell take-rate, 0–100. */
  upsellRate: number;
  /** Change vs. previous period, in percentage points. */
  upsellRateDelta: number;
  /** Average NPS score (-100…100, demo uses 0–100 customary). */
  averageNps: number;
}

/** Audience filter on a flow detail page — segment + interaction history. */
export interface RetentionAudienceFilter {
  segment?: string;
  /** Minimum days since last interaction to qualify. */
  minDaysSinceInteraction?: number;
  /** Maximum days since last interaction to qualify. */
  maxDaysSinceInteraction?: number;
  /** Free-form tag filter (e.g. "VIP", "Repeat"). */
  tags?: string[];
}
