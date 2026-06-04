// Enrichment Data types (Wave 2A) — local to the enrichment module.
// Do NOT add these to lib/types.ts (owned by other agents). Import shared
// types from "@/lib/types" instead.

import type { AiTemp, DealStage } from "@/lib/types";

/** Activity status for an enriched prospect/deal. */
export type EnrichmentActivityStatus = "aktif" | "berhenti";

/** Segment a product is targeted at. */
export type EnrichmentSegment = "UMKM" | "Menengah" | "Enterprise";

/** Employee-band the product is sized for (matches Company.size in mock data). */
export type EnrichmentCompanySize = "1-10" | "11-50" | "51-200" | "201-500" | "500+";

/** A product offered by the client — feeds the AI matching logic. */
export interface EnrichmentProduct {
  id: string;
  name: string;
  description: string;
  /** Price in IDR (rupiah). */
  priceIDR: number;
  targetSegment: EnrichmentSegment;
  /** Which company-size bands this product is best suited for. */
  targetCompanySize: EnrichmentCompanySize[];
  /** Optional accent color for the product chip. */
  accent?: string;
}

/** AI-derived analysis layer attached to an existing Deal (by dealId). */
export interface EnrichmentDealAnalysis {
  dealId: string;
  /** 0–100 priority score. */
  priorityScore: number;
  temperature: AiTemp;
  status: EnrichmentActivityStatus;
  /** Last activity ISO timestamp — used to derive `status`. */
  lastActivity: string;
  /** Days spent in the current pipeline stage. */
  daysInStage: number;
  /** Inferred current stage (mirrors Deal.stage, kept for convenience). */
  stage: DealStage;
  /** Short one-line AI message recommendation. */
  aiSuggestion: string;
  /** IDs of the products considered the best fit (refers to EnrichmentProduct.id). */
  matchedProducts: string[];
  /** Inferred company-size band — used for product matching. */
  companySize: EnrichmentCompanySize;
}

/** Aggregate insights surfaced in the AI Analysis panel. */
export interface EnrichmentInsights {
  highPriorityCount: number;
  droppedCount: number;
  avgDaysInPenawaran: number;
  /** Compared to last period, in days. Negative = faster than before. */
  avgDaysInPenawaranDelta: number;
  /** Best product (by id) for the UMKM segment based on matches. */
  topProductIdForUMKM: string | null;
  /** Best product (by id) for the Enterprise segment based on matches. */
  topProductIdForEnterprise: string | null;
}
