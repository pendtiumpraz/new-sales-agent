// WhatsApp reply orchestrator (Phase 3 — stage-aware). Turns an inbound WA
// message into a paced, human-feeling bubble array, guided by the conversation
// STAGE (rapport → discovery → value → objection → closing). Value-first, plain
// text, closing techniques only at the closing stage.
//
// Guardrails:
//  - topic guard: off-topic (politik/SARA/judi/…) → humanis deflect, no AI spend
//  - priceGate: no price until need + value (driven by the state machine)
//  - graceful degradation: no model / credit habis → holding + handoff
//  - deliberate handoff: complaint/negotiation signals → holding + handoff

import { meteredGenerateText } from "@/lib/ai/meter";
import { humanize, type Bubble } from "@/lib/ai/humanizer";
import { stripMarkdown } from "@/lib/ai/sanitize";
import { SAFETY_RULES, wrapUntrusted } from "@/lib/ai/safety";
import { CLOSING_TECHNIQUES_17, formatClosingTechniques } from "@/lib/kb/closing-techniques";
import { decide, type Stage, type Turn } from "@/lib/sales/stage-machine";
import { scoreReadiness, type Readiness } from "@/lib/sales/predictive";
import { salutationFor } from "@/lib/profiling/salutation";
import type { TenantContext } from "@/lib/db/tenant-context";
import type { SalesPlay } from "@/lib/types/sales-play";

export interface WaReplyInput {
  contactName: string;
  /** Inbound message text (untrusted). */
  message: string;
  /** Recent turns for context + stage detection. */
  history?: Turn[];
  /** Current stage (from the store); the machine may advance it. */
  stage?: Stage;
  /** Market type (from Market-Fit) → weights which techniques are offered. */
  marketType?: "B2B" | "B2C" | "mix";
  /** Per-workspace Sales Play (priceGate bridge, value ladder, adab, handoff). */
  salesPlay?: SalesPlay;
}

export interface WaReplyResult {
  action: "send" | "handoff";
  bubbles: Bubble[];
  source: "ai" | "deflect" | "holding";
  /** Stage to persist for the next turn. */
  nextStage: Stage;
  /** Closing-readiness score + next-best-action for this turn. */
  readiness: Readiness;
}

const OFF_TOPIC =
  /\b(politik|pemilu|capres|caleg|partai|sara|judi|slot|togel|porno|seks|narkoba|sabu)\b/i;

const HOLDING = [
  "bentar ya, aku cek dulu infonya 🙏",
  "oke noted, aku siapin dulu sebentar ya 🙏",
  "hmm, aku pastiin dulu biar nggak salah ya, sebentar 🙏",
];

function historyToText(turns: Turn[]): string {
  return turns
    .map((t) => `${t.role === "customer" ? "Pelanggan" : "Kami"}: ${t.text}`)
    .join("\n");
}

export async function buildWaReply(
  ctx: TenantContext,
  input: WaReplyInput,
): Promise<WaReplyResult> {
  const sal = salutationFor(input.contactName);
  const turns = input.history ?? [];
  const decision = decide(input.stage, turns, input.message);
  const customerTurns = turns.filter((t) => t.role === "customer").length;
  const readiness = scoreReadiness(decision.stage, decision.signals, customerTurns);

  // Per-workspace Sales Play tuning (falls back to built-in defaults when absent).
  const plan = input.salesPlay;
  const filler = plan?.adab.allowFiller ?? true;
  const maxSent = plan?.adab.maxSentencesPerBubble ?? 2;
  const lowerMsg = input.message.toLowerCase();
  const offTopic =
    OFF_TOPIC.test(input.message) ||
    (plan?.adab.forbiddenTopics ?? []).some((t) => t && lowerMsg.includes(t.toLowerCase()));
  const planHandoff = (plan?.handoff.keywords ?? []).some((k) => k && lowerMsg.includes(k.toLowerCase()));

  // Topic guard — humanis deflect, no AI call (stage unchanged).
  if (offTopic) {
    return {
      action: "send",
      source: "deflect",
      nextStage: input.stage ?? decision.stage,
      readiness,
      bubbles: humanize(
        `hehe itu di luar yang bisa aku bantu ya ${sal.greeting} 😄. tapi kalau soal kebutuhan Anda aku siap bantu, boleh cerita sedikit?`,
        { filler: false },
      ),
    };
  }

  // Deliberate handoff (complaint/negotiation, or a Sales Play keyword).
  if (decision.nextAction === "handoff" || planHandoff) {
    const hold = HOLDING[input.message.length % HOLDING.length];
    return {
      action: "handoff",
      source: "holding",
      nextStage: decision.stage,
      readiness,
      bubbles: humanize(hold, { filler: false }),
    };
  }

  // Closing techniques only surface AT the closing stage, weighted by market.
  const techniqueBlock =
    decision.stage === "closing"
      ? `\n\nTeknik closing (pilih 1 yang cocok dengan sinyal):\n` +
        formatClosingTechniques(CLOSING_TECHNIQUES_17, { market: input.marketType, max: 8 })
      : "";

  // Sales Play injections (bridge when price-gated, value ladder, worth-of-cost).
  const planBlock = plan
    ? (!decision.priceGateOpen && plan.priceGate.earlyPriceBridge
        ? `\n\nKalau ditanya harga sekarang, JANGAN kasih angka — bridge pakai ini: "${plan.priceGate.earlyPriceBridge}"`
        : "") +
      (plan.valueLadder.length
        ? `\n\nValue yang harus disampaikan (urut, sebelum harga):\n- ${plan.valueLadder.join("\n- ")}`
        : "") +
      (plan.worthOfCost.enabled && plan.worthOfCost.costAnchors.length
        ? `\n\nAnchor biaya-masalah (worth of cost):\n- ${plan.worthOfCost.costAnchors.join("\n- ")}`
        : "")
    : "";

  const system =
    `Kamu sales humanis (BUKAN robot), Bahasa Indonesia, hangat & empatik. ` +
    `Sapa "${sal.greeting}". JANGAN pernah menyebut dirimu AI/bot. ` +
    `Balas SINGKAT & manusiawi: maks ${maxSent} kalimat per ide, total maksimal 3 kalimat, ` +
    `akhiri dengan SATU pertanyaan pilihan biar interaktif. ` +
    `\n\nIKUTI ARAHAN TAHAP INI: ${decision.guidance}` +
    planBlock +
    techniqueBlock +
    "\n\n" + SAFETY_RULES +
    (turns.length ? `\n\nKonteks percakapan terkini:\n${historyToText(turns)}` : "");

  try {
    const { text } = await meteredGenerateText(ctx, {
      feature: "wa_reply",
      system,
      prompt:
        `Balas pesan WhatsApp masuk ini sesuai arahan tahap (sapa "${sal.greeting}").\n` +
        wrapUntrusted("pesan_masuk", input.message),
      maxOutputTokens: 220,
    });
    const reply = stripMarkdown(text ?? "").trim();
    if (!reply) throw new Error("empty reply");
    return {
      action: "send",
      source: "ai",
      nextStage: decision.stage,
      readiness,
      bubbles: humanize(reply, { filler }),
    };
  } catch {
    // No model / credit habis / suspended → holding + handoff. Stay human.
    const hold = HOLDING[input.message.length % HOLDING.length];
    return {
      action: "handoff",
      source: "holding",
      nextStage: decision.stage,
      readiness,
      bubbles: humanize(hold, { filler: false }),
    };
  }
}
