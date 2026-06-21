// Market-Fit Analyzer (Phase 2) — given a product + the tenant's segments,
// classify B2B vs B2C, derive an ICP, and score segment fit. Output feeds
// Discovery targeting and the SalesPlay marketType (which weights closing
// techniques: aggressive ones B2C-only).

export interface MarketFitSegmentScore {
  /** Segment label, e.g. "UMKM" / "Korporat". */
  label: string;
  /** Fit 0–100. */
  score: number;
  reason: string;
}

export interface MarketFitIcp {
  /** Target industries / fields. */
  industri: string[];
  /** Company-size band (B2B) or audience note (B2C). */
  ukuran: string;
  /** Decision-maker roles to target (mostly B2B). */
  jabatanPIC: string[];
  /** B2C demographic note. */
  demografi: string;
  /** B2C interests / triggers. */
  minat: string[];
}

export interface MarketFitResult {
  marketType: "B2B" | "B2C" | "mix";
  /** Classification confidence 0–100. */
  confidence: number;
  icp: MarketFitIcp;
  segmentFit: MarketFitSegmentScore[];
  rationale: string;
  source: "ai" | "heuristic";
}

export interface MarketFitInput {
  productName: string;
  productDescription: string;
  segments: {
    label: string;
    description?: string;
    headcountBand?: string;
    revenueBand?: string;
  }[];
}
