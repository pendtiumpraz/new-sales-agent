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

/** Per-channel discovery guidance — what to search WHERE to find leads + their
 *  email/HP, derived from the market-fit. Feeds the crawler (server + extension). */
export interface MarketFitChannelPlay {
  /** "LinkedIn" | "Google" | "Instagram" | "TikTok" | "Shopee / Tokopedia" | … */
  channel: string;
  /** What to search on this channel (queries / keywords). */
  kueri: string[];
  /** Job titles to target — mainly LinkedIn / B2B. */
  jabatan?: string[];
  /** 1-line tip incl. the contact data you can expect here (email / HP). */
  petunjuk?: string;
}

export interface MarketFitResult {
  marketType: "B2B" | "B2C" | "mix";
  /** Classification confidence 0–100. */
  confidence: number;
  icp: MarketFitIcp;
  segmentFit: MarketFitSegmentScore[];
  /** Where + what to search to find these leads (and their email/HP). */
  discoveryPlaybook?: MarketFitChannelPlay[];
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
