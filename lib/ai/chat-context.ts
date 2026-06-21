// Chat context selection (token-thrifty history).
//
// Goal (per product spec): don't send the WHOLE transcript every turn. Keep a
// running summary of the conversation and, when building the next turn's
// context, send whichever is SHORTER:
//   - if the raw chat is more compact than the summary → send the raw chat;
//   - if the raw chat is longer than the summary → send the summary (plus the
//     most recent turns verbatim) as the carried-over context.
//
// This file is intentionally PURE (no AI / server imports) so it stays unit-
// testable and can run on either side. The AI-backed summary generation lives
// in ./summarize-conversation.

import type { UIMessage } from "ai";

/** Rough token estimate. ~4 chars/token is close enough for a length COMPARISON
 *  (we only need full-vs-summary ordering, not an exact budget). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Flatten a UIMessage's text parts into a single string. AI SDK v6 stores text
 *  on `parts[]` (TextUIPart); the legacy `content` field is not guaranteed. */
export function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p?.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

/** Serialize messages into a plain `Role: text` transcript (for length compare
 *  and for feeding the summarizer). */
export function messagesToTranscript(messages: UIMessage[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "Pelanggan" : "AI"}: ${messageText(m)}`)
    .filter((line) => line.length > 4)
    .join("\n");
}

export interface ChatContextResult {
  /** "full" = send the raw messages; "summary" = send summary + recent tail. */
  mode: "full" | "summary";
  /** The messages to actually convert + send to the model. */
  messages: UIMessage[];
  /** When mode === "summary", prepend this to the system prompt as carried-over
   *  context. Null when sending the full transcript. */
  summaryNote: string | null;
}

/**
 * Decide what to send as context for the next turn.
 *
 * Compares the full transcript against (summary + the last `keepRecent` turns)
 * and returns the cheaper one — exactly the spec'd rule: shorter-of-the-two,
 * with the summary only taking over once the raw chat outgrows it.
 *
 * `keepRecent` turns are ALWAYS kept verbatim in summary mode so the model still
 * sees the customer's exact latest words (mirroring matters for closing).
 */
export function selectChatContext(opts: {
  messages: UIMessage[];
  summary: string | null;
  keepRecent?: number;
}): ChatContextResult {
  const { messages, summary } = opts;
  const keepRecent = Math.max(1, opts.keepRecent ?? 4);

  // No summary available → nothing to compare against, send full.
  if (!summary || !summary.trim()) {
    return { mode: "full", messages, summaryNote: null };
  }

  const fullTokens = estimateTokens(messagesToTranscript(messages));

  const recent = messages.slice(-keepRecent);
  const summaryModeTokens =
    estimateTokens(summary) + estimateTokens(messagesToTranscript(recent));

  // Raw chat is the same length or shorter → send the chat itself.
  if (fullTokens <= summaryModeTokens) {
    return { mode: "full", messages, summaryNote: null };
  }

  // Raw chat is longer → summary becomes the carried-over context, with the
  // recent tail kept verbatim.
  return { mode: "summary", messages: recent, summaryNote: summary.trim() };
}
