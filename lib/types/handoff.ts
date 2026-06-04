// Handoff & sentiment types (Wave 2C) — local to the inbox/handoff module.
// Do NOT add these to lib/types.ts (owned by other agents).

/** Sentiment trend direction over the last few messages. */
export type SentimentTrend = "up" | "down" | "stable";

/** Which trigger caused (or could cause) a human handoff. */
export type HandoffTrigger = "sentiment" | "timeout" | "complexity";

/** Status of a conversation w.r.t. AI ↔ human handoff. */
export type HandoffStatus = "ai" | "handed-off" | "resolved";

/** Per-conversation sentiment snapshot — score is -100..+100. */
export interface ConversationSentiment {
  conversationId: string;
  /** Current sentiment score, -100 (very negative) to +100 (very positive). */
  score: number;
  trend: SentimentTrend;
  /** Sparkline history — oldest → newest. */
  history: { timestamp: string; score: number }[];
  /** Last AI response timestamp — drives timeout trigger. */
  lastAiResponseAt: string;
  /** Topics detected in the conversation (for complexity matching). */
  topics: string[];
  /** Product mentions found in the thread (for market mapping). */
  productMentions: string[];
}

/** A recorded handoff event for the audit log. */
export interface HandoffEvent {
  id: string;
  conversationId: string;
  trigger: HandoffTrigger;
  triggeredAt: string;
  resolvedAt?: string;
  assignedTo?: string;
  /** Short Bahasa Indonesia note about why this fired. */
  note?: string;
}

/** Aggregate sentiment per product — for market mapping (consumed by Wave 2E). */
export interface ProductSentiment {
  productName: string;
  averageScore: number;
  mentions: number;
  /** Delta vs last week, in score points. Positive = improving. */
  trendVsLastWeek: number;
  /** Optional sample comment lifted from the inbox for the analytics view. */
  sampleQuote?: string;
}

/** Workspace-level handoff configuration. */
export interface HandoffConfig {
  /** Threshold (0..100). Sentiment drops below this → escalate. Default 30. */
  sentimentThreshold: number;
  /** Minutes without resolution → escalate. Default 15. */
  timeoutMinutes: number;
  /** Editable list of complexity topics that always escalate. */
  complexityTopics: string[];
  /** Master switch for AI auto-reply across the inbox. */
  autoReplyEnabled: boolean;
}

/** Live handoff state per conversation, held in the Zustand store. */
export interface ConversationHandoffState {
  conversationId: string;
  status: HandoffStatus;
  /** Which triggers are currently firing right now. */
  activeTriggers: HandoffTrigger[];
  /** Display name of the human owner once taken over. */
  takenOverBy?: string;
  takenOverAt?: string;
}
