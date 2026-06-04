// Analytics & Reporting types (Wave 2E) — local to the reports module.
// Per feature-revisions.md §7: AI error rate tracking, end-to-end sales
// dashboard, and pipeline data verification. Do NOT add these to lib/types.ts
// (other agents own it).

/** A single point on the AI error-rate trend line (last 30 days). */
export interface AiErrorTrendPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Error rate percentage 0–100 for that day. */
  rate: number;
}

/** Error breakdown by category — Indonesian labels for the four taxonomy buckets. */
export interface AiErrorTypeBreakdown {
  type: string;
  count: number;
  rate: number;
}

/** Top recent flagged AI response — surfaced in a table for QA. */
export interface AiFlaggedResponse {
  id: string;
  conversationId: string;
  snippet: string;
  reason: string;
  /** ISO timestamp when the response was flagged. */
  flaggedAt: string;
}

/** §7.1 — AI error rate tracking report. */
export interface AiErrorReport {
  totalResponses: number;
  errorCount: number;
  /** 0–100. */
  errorRate: number;
  /** Delta in percentage points vs. prior 7-day window. Negative = improving. */
  errorRateDeltaPctPoints: number;
  trend30d: AiErrorTrendPoint[];
  byType: AiErrorTypeBreakdown[];
  recentFlagged: AiFlaggedResponse[];
}

/** Funnel datum per channel — counts at each pipeline stage. */
export interface ChannelFunnelDatum {
  channel: string;
  prospect: number;
  qualified: number;
  offer: number;
  won: number;
}

/** Top cadence by reply-rate performance. */
export interface CadencePerformanceRow {
  name: string;
  /** 0–100. */
  replyRate: number;
  enrolled: number;
}

/** Top content asset by reach. */
export interface ContentPerformanceRow {
  title: string;
  type: string;
  reach: number;
}

/** Sales rep leaderboard row. */
export interface LeaderboardRow {
  name: string;
  deals: number;
  /** Total value in IDR (full Rupiah, not compacted). */
  valueIDR: number;
}

/** §7.2 — End-to-end sales/marketing dashboard. */
export interface SalesReport {
  revenueMtdIDR: number;
  dealsClosedMtd: number;
  /** 0–100. */
  conversionRate: number;
  avgCycleDays: number;
  byChannel: ChannelFunnelDatum[];
  topCadences: CadencePerformanceRow[];
  topContent: ContentPerformanceRow[];
  leaderboard: LeaderboardRow[];
}

/** Severity for pipeline data quality issues. */
export type PipelineIssueSeverity = "tinggi" | "sedang" | "rendah";

/** A single category of pipeline data quality issue. */
export interface PipelineIssue {
  id: string;
  type: string;
  count: number;
  severity: PipelineIssueSeverity;
}

/** §7.3 — Pipeline data verification report. */
export interface PipelineVerification {
  totalDeals: number;
  cleanDeals: number;
  /** 0–100. */
  cleanRate: number;
  issues: PipelineIssue[];
}
