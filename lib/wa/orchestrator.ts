// WhatsApp reply orchestrator (Phase 3 — server-emit). Turns an inbound WA
// message into a paced, human-feeling bubble array the gateway can send with
// typing + delays. Value-first, no early price, plain text (no markdown).
//
// Guardrails:
//  - topic guard: off-topic (politik/SARA/judi/…) → humanis deflect, no AI spend
//  - graceful degradation: no model / credit habis / suspended → holding bubble
//    + handoff (NEVER an error to the lead) — "biar tetep kelihatan manusia"

import { meteredGenerateText } from "@/lib/ai/meter";
import { humanize, type Bubble } from "@/lib/ai/humanizer";
import { stripMarkdown } from "@/lib/ai/sanitize";
import { SAFETY_RULES, wrapUntrusted } from "@/lib/ai/safety";
import { CLOSING_TECHNIQUES_17, formatClosingTechniques } from "@/lib/kb/closing-techniques";
import { salutationFor } from "@/lib/profiling/salutation";
import type { TenantContext } from "@/lib/db/tenant-context";

export interface WaReplyInput {
  contactName: string;
  /** Inbound message text (untrusted). */
  message: string;
  /** Optional recent-turns transcript for context (plain, not summarized). */
  history?: string;
}

export interface WaReplyResult {
  /** "send" = paced bubbles; "handoff" = holding bubble sent + flag a human. */
  action: "send" | "handoff";
  bubbles: Bubble[];
  source: "ai" | "deflect" | "holding";
}

// Off-topic / forbidden → deflect, don't spend tokens (and don't take the bait).
const OFF_TOPIC =
  /\b(politik|pemilu|capres|caleg|partai|sara|judi|slot|togel|porno|seks|narkoba|sabu)\b/i;

// Pre-written holding lines (no AI) — used when AI is unavailable / credit 0.
const HOLDING = [
  "bentar ya, aku cek dulu infonya 🙏",
  "oke noted, aku siapin dulu sebentar ya 🙏",
  "hmm, aku pastiin dulu biar nggak salah ya, sebentar 🙏",
];

/**
 * Build a humanized WA reply for an inbound message. Never throws — on any AI
 * failure it returns a holding+handoff result so the lead still sees something
 * human and a rep can take over.
 */
export async function buildWaReply(
  ctx: TenantContext,
  input: WaReplyInput,
): Promise<WaReplyResult> {
  const sal = salutationFor(input.contactName);

  // Topic guard — humanis deflect, no AI call.
  if (OFF_TOPIC.test(input.message)) {
    return {
      action: "send",
      source: "deflect",
      bubbles: humanize(
        `hehe itu di luar yang bisa aku bantu ya ${sal.greeting} 😄. tapi kalau soal kebutuhan Anda aku siap bantu, boleh cerita sedikit?`,
        { filler: false },
      ),
    };
  }

  const system =
    `Kamu sales humanis (BUKAN robot), Bahasa Indonesia, hangat & empatik. ` +
    `Sapa "${sal.greeting}". JANGAN pernah menyebut dirimu AI/bot. ` +
    `Sampaikan VALUE dulu — JANGAN sebut harga sebelum kebutuhan pelanggan jelas. ` +
    `Balas SINGKAT & manusiawi: 1–2 kalimat per ide, total maksimal 3 kalimat, ` +
    `dan akhiri dengan SATU pertanyaan pilihan (mis. "a atau b?") biar interaktif. ` +
    SAFETY_RULES +
    `\n\nTeknik closing (pakai HANYA kalau pelanggan sudah dekat keputusan, sesuai sinyal):\n` +
    formatClosingTechniques(CLOSING_TECHNIQUES_17, { max: 8 }) +
    (input.history ? `\n\nKonteks percakapan terkini:\n${input.history}` : "");

  try {
    const { text } = await meteredGenerateText(ctx, {
      feature: "wa_reply",
      system,
      prompt:
        `Balas pesan WhatsApp masuk ini dengan hangat & value-first (sapa "${sal.greeting}").\n` +
        wrapUntrusted("pesan_masuk", input.message),
      maxOutputTokens: 220,
    });
    const reply = stripMarkdown(text ?? "").trim();
    if (!reply) throw new Error("empty reply");
    return { action: "send", source: "ai", bubbles: humanize(reply, { filler: true }) };
  } catch {
    // No model / credit habis / suspended → holding + handoff. Stay human.
    const hold = HOLDING[input.message.length % HOLDING.length];
    return { action: "handoff", source: "holding", bubbles: humanize(hold, { filler: false }) };
  }
}
