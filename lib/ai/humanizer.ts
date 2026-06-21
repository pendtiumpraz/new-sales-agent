// Humanizer — turn one AI reply into a sequence of short, human-feeling chat
// bubbles (WhatsApp/IG style) instead of one wall-of-text block.
//
// Rules (see docs/sales-script-humanis.md): 1 bubble = 1–2 sentences, plain text
// (no markdown), optional sparse "hmm" filler, and a per-bubble delay ~ length so
// the client can pace it like someone actually typing.
//
// PURE — no React/DOM/AI. Reused by the in-app chat (client playback) and later
// by the WhatsApp orchestrator (server: emit the bubble array, extension paces).

import { stripMarkdown } from "@/lib/ai/sanitize";

export interface Bubble {
  text: string;
  kind: "content" | "filler";
  /** Suggested pause (ms) BEFORE this bubble shows — i.e. the "typing" time. */
  delayMs: number;
}

export interface HumanizeOptions {
  /** Max sentences merged into one bubble. Default 2. */
  maxSentencesPerBubble?: number;
  /** Soft char cap per bubble — a longer single sentence still gets its own bubble. Default 140. */
  maxCharsPerBubble?: number;
  /** Allow a leading "hmm / bentar ya" filler bubble (only when >1 bubble). Default false. */
  filler?: boolean;
  /** Filler pool — picked deterministically by text length (hydration-safe). */
  fillerPool?: string[];
  /** Min typing pause per bubble. Default 500ms. */
  minDelayMs?: number;
  /** Typing speed — ms per character. Default 28 (~36 wpm, relaxed/human). */
  msPerChar?: number;
  /** Max typing pause per bubble. Default 2200ms. */
  maxDelayMs?: number;
}

const DEFAULT_FILLERS = ["hmm...", "oke noted 👌", "bentar ya 🙏", "sip, aku jelasin ya"];

/** Split text into sentence-ish runs, keeping end punctuation + trailing emoji. */
function splitSentences(text: string): string[] {
  const oneLine = text.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!oneLine) return [];
  // Runs ending in . ! ? (one or more), or the final run with no terminator.
  const matches = oneLine.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return (matches ?? [oneLine]).map((s) => s.trim()).filter(Boolean);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Convert an AI reply into paced bubbles. Strips markdown first (people don't
 * type `**bold**` on WA → instant AI tell). Returns [] for empty input.
 */
export function humanize(text: string, opts: HumanizeOptions = {}): Bubble[] {
  const {
    maxSentencesPerBubble = 2,
    maxCharsPerBubble = 140,
    filler = false,
    fillerPool = DEFAULT_FILLERS,
    minDelayMs = 500,
    msPerChar = 28,
    maxDelayMs = 2200,
  } = opts;

  const clean = stripMarkdown(text);
  const sentences = splitSentences(clean);
  if (sentences.length === 0) return [];

  // Group sentences into bubbles: cap by sentence count AND soft char length.
  const groups: string[] = [];
  let cur = "";
  let curCount = 0;
  for (const s of sentences) {
    const candidate = cur ? `${cur} ${s}` : s;
    const wouldOverflow =
      curCount >= maxSentencesPerBubble || (cur && candidate.length > maxCharsPerBubble);
    if (wouldOverflow) {
      if (cur) groups.push(cur);
      cur = s;
      curCount = 1;
    } else {
      cur = candidate;
      curCount += 1;
    }
  }
  if (cur) groups.push(cur);

  const bubbles: Bubble[] = groups.map((t) => ({
    text: t,
    kind: "content" as const,
    delayMs: clamp(Math.round(t.length * msPerChar), minDelayMs, maxDelayMs),
  }));

  // Sparse filler: only when the answer is actually multi-bubble (otherwise it
  // feels fake on a one-liner). Deterministic pick → no hydration mismatch.
  if (filler && bubbles.length >= 2 && fillerPool.length > 0) {
    const pick = fillerPool[clean.length % fillerPool.length];
    bubbles.unshift({ text: pick, kind: "filler", delayMs: clamp(450, minDelayMs - 100, 700) });
  }

  return bubbles;
}
