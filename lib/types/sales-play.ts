// Sales Play — per-workspace config that drives the conversation orchestrator.
// One workspace = one product = one Sales Play. Encodes the humanis rules
// (docs/sales-script-humanis.md): stages, adab, priceGate, worth-of-cost,
// value ladder, handoff, and which of the 17 closing techniques are allowed.

export type SalesStageKey =
  | "rapport"
  | "discovery"
  | "value"
  | "objection"
  | "closing";

export interface SalesStage {
  key: SalesStageKey;
  label: string;
  /** What this stage is trying to achieve. */
  goal: string;
  /** When the orchestrator may advance to the next stage. */
  exitCriteria: string;
}

export interface AdabPolicy {
  /** Max sentences merged into one chat bubble. */
  maxSentencesPerBubble: number;
  /** Allow a sparse "hmm / bentar ya" filler bubble. */
  allowFiller: boolean;
  /** Prefer close (A/B) questions over open ones. */
  closeQuestions: boolean;
  /** Plain text only — never markdown (instant AI tell). */
  noMarkdown: boolean;
  /** Emoji register. */
  emoji: "off" | "sparse" | "warm";
  /** Topics the AI must deflect (politik/SARA/etc). */
  forbiddenTopics: string[];
}

export interface PriceGate {
  /** Don't state price until the need is identified. */
  requireNeed: boolean;
  /** ...and until value has been delivered. */
  requireValue: boolean;
  /** What to say when asked price too early (bridge, not refuse). */
  earlyPriceBridge: string;
}

export interface WorthOfCost {
  enabled: boolean;
  /** Cost-of-the-problem anchors so price reads smaller than the problem. */
  costAnchors: string[];
}

export interface HandoffRules {
  onNegotiation: boolean;
  onComplaint: boolean;
  /** Hand off to a human above this deal size (IDR). Null = no threshold. */
  onPriceAboveIDR: number | null;
  /** Extra keywords that force a human handoff. */
  keywords: string[];
}

// Material (banner / 1-min video / case study) the AI may offer AT a stage —
// "sodorin visual di momen tepat, bukan teks panjang" (G6).
export interface StageMaterial {
  id: string;
  stage: SalesStageKey;
  label: string;
  kind: "banner" | "video" | "studi-kasus" | "link";
  /** URL or content id. */
  ref: string;
}

export interface SalesPlay {
  workspaceId?: string;
  productId?: string;
  /** Set by the Market-Fit Analyzer (Phase 2); drives technique weighting. */
  marketType: "B2B" | "B2C" | "mix";
  stages: SalesStage[];
  adab: AdabPolicy;
  priceGate: PriceGate;
  worthOfCost: WorthOfCost;
  /** Ordered value points to deliver before price. */
  valueLadder: string[];
  handoff: HandoffRules;
  /** Allowed closing technique ids (subset of the 17). Empty = all that fit market. */
  closingTechniqueIds: string[];
  /** Materials linked to stages — offered by the AI at the matching stage. */
  stageMaterials: StageMaterial[];
}
