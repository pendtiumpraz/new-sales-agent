// Knowledge Base types (Wave 2B) — per-client KB used by Advanced RAG,
// retention flows, and enrichment matching. Local to the KB module.
//
// IMPORTANT: do NOT add these to lib/types.ts (owned by other agents).
// Shared domain types live in "@/lib/types" — import from there as needed.

/** Customer segment the KB targets. Matches Wave 2A enrichment segments. */
export type KbSegmentTier = "UMKM" | "Menengah" | "Korporat";

/** A product offered by the client — fed into AI matching + retention. */
export interface KbProduct {
  id: string;
  name: string;
  description: string;
  /** Optional SKU/identifier visible in UI. */
  sku?: string;
  /** Short tag — e.g. "Inti", "Add-on", "Bundling". */
  category: "Inti" | "Add-on" | "Bundling";
  /** Whether the product is currently being sold. */
  active: boolean;
  /** Soft accent color used for product chips. */
  accent?: string;
}

/** Pricing tier for a product (per spec §4 — pricing per product, per tier). */
export interface KbPricingTier {
  id: string;
  productId: string;
  tierName: string;
  /** Price in IDR (rupiah). */
  priceIDR: number;
  /** Billing cadence — used in copy. */
  billing: "bulanan" | "tahunan" | "satu-kali";
  /** Bullet features included at this tier. */
  features: string[];
  /** Optional minimum commitment (e.g. months). */
  minCommitmentMonths?: number;
}

/** Target market segment definition with sizing hints. */
export interface KbSegment {
  id: string;
  /** Pretty label shown in UI ("UMKM", "Menengah", "Korporat"). */
  label: KbSegmentTier;
  description: string;
  /** Indicative annual revenue band — Indonesian phrasing. */
  revenueBand: string;
  /** Indicative employee headcount band. */
  headcountBand: string;
  /** AI talking-points tailored to this segment. */
  talkingPoints: string[];
}

/** A marketing strategy note / playbook bullet (per spec §4). */
export interface KbStrategyNote {
  id: string;
  title: string;
  body: string;
  /** Optional segment scope; null = applies to all segments. */
  segmentId?: string | null;
}

/** Trigger types for retention flows (per spec §6). */
export type KbRetentionTriggerType = "repeat-order" | "after-sales" | "loyalty";

/** Retention flow rule — drives Wave 2D retention automations. */
export interface KbRetentionFlow {
  id: string;
  name: string;
  type: KbRetentionTriggerType;
  /** Plain-language description of what triggers this flow. */
  trigger: string;
  /** Plain-language description of the action AI should take. */
  action: string;
  /** Days after trigger event to execute the action. */
  delayDays: number;
  /** Optional product scope — empty = all products. */
  productIds: string[];
  /** Optional segment scope — empty = all segments. */
  segmentIds: string[];
  active: boolean;
}

/** Upsell mapping — what to offer after an initial product (per spec §4). */
export interface KbUpsellRule {
  id: string;
  fromProductId: string;
  toProductIds: string[];
  /** Why this upsell is recommended — surfaced to AI + sales rep. */
  rationale: string;
}

/** Priority-product mapping per segment (per spec §4). */
export interface KbPriorityMapping {
  segmentId: string;
  productIds: string[];
}

/** A closing technique the AI may reach for at the CLOSING stage (end of flow).
 *  Seeded with the 17 Teknik Closing (Dewa Eka Prayoga); tenants can override. */
export interface KbClosingTechnique {
  id: string;
  /** Technique name, e.g. "Now or Never". */
  nama: string;
  /** One-line how it works. */
  inti: string;
  /** Optional sample line (plain text — no markdown). */
  contohSkrip?: string;
  /** Which market this fits — aggressive ones are B2C-only so B2B stays consultative. */
  cocokUntuk: ("B2B" | "B2C")[];
  /** Signals that should make the AI reach for this (e.g. "ditanya harga", "nunda"). */
  sinyalPemicu: string[];
}

/** Source kind feeding the Advanced RAG retriever (per spec §4). */
export type KbSourceKind = "pdf" | "url" | "faq" | "doc";

/** Indexing lifecycle status — drives the badge + retrieval eligibility. */
export type KbSourceStatus = "indexed" | "indexing" | "stale" | "error";

/**
 * Single knowledge source consumed by Advanced RAG.
 * Mocked: chunks/lastIndexedAt are illustrative — no real indexing pipeline.
 */
export interface KbSource {
  id: string;
  kind: KbSourceKind;
  title: string;
  description?: string;
  /** For url: the URL; for pdf/doc: the filename; for faq: optional source label. */
  ref?: string;
  /** FAQ payload — present only when kind === "faq". */
  question?: string;
  answer?: string;
  /** Segment IDs this source applies to. Empty array = "semua segmen". */
  segmentScope?: string[];
  /** Mocked retrieval chunk count. */
  chunks: number;
  /** ISO timestamp of the last (mocked) indexing run. */
  lastIndexedAt: string;
  status: KbSourceStatus;
  active: boolean;
}

/** Full per-client knowledge base — single tenant in demo. */
export interface KnowledgeBase {
  clientId: string;
  clientName: string;
  products: KbProduct[];
  pricing: KbPricingTier[];
  segments: KbSegment[];
  priorityProducts: KbPriorityMapping[];
  marketingStrategy: KbStrategyNote[];
  upsellMap: KbUpsellRule[];
  retentionFlows: KbRetentionFlow[];
  /** Advanced RAG sources — PDFs, URLs, FAQ pairs, docs. */
  sources: KbSource[];
  /** Closing techniques used at the closing stage. Optional — falls back to the
   *  seeded 17 (lib/kb/closing-techniques) when absent. */
  closingTechniques?: KbClosingTechnique[];
  /** ISO timestamp of last edit. */
  lastUpdated: string;
}
