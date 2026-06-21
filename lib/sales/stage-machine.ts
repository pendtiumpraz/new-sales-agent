// Conversation state machine (Phase 3). Tracks where a sales chat is in the
// closing flow and decides the next move. Deterministic/heuristic — no AI cost.
// Stages: rapport → discovery → value → objection → closing (closing at END).

import type { SalesStageKey } from "@/lib/types/sales-play";

export type Stage = SalesStageKey;

export interface Turn {
  role: "customer" | "us";
  text: string;
}

export interface StageSignals {
  needIdentified: boolean;
  valueDelivered: boolean;
  priceAsked: boolean;
  objection: boolean;
  closingIntent: boolean;
}

export type NextAction = "gali" | "value" | "objection" | "close" | "handoff";

export interface StageDecision {
  stage: Stage;
  /** Price may be stated only when need + value are satisfied. */
  priceGateOpen: boolean;
  nextAction: NextAction;
  /** Stage-specific instruction injected into the system prompt. */
  guidance: string;
}

const NEED = /\b(masalah|butuh|perlu|pengen|pengin|kepengen|mau|kendala|susah|capek|bingung|cari|kesulitan|target|pusing)\b/i;
const VALUE_OURS = /\b(bisa bantu|manfaat|solusi|hasil|keuntungan|beda|unggul|hemat|untung|value|kelebihan)\b/i;
const PRICE = /\b(harga|berapa|biaya|tarif|bayar|mahal|murah|diskon|promo)\b/i;
const OBJECTION = /\b(mahal|kemahalan|mikir dulu|pikir-pikir|nanti dulu|ragu|belum yakin|bandingkan|kompetitor|nego|kurang)\b/i;
const CLOSING_INTENT = /\b(oke|ok|sip|deal|mau ambil|jadi ambil|beli|pesan|order|lanjut|gas|gimana cara|caranya|transfer|checkout)\b/i;

export function detectSignals(history: Turn[], inbound: string): StageSignals {
  const customerText = [
    ...history.filter((t) => t.role === "customer").map((t) => t.text),
    inbound,
  ].join(" \n ");
  const ourText = history.filter((t) => t.role === "us").map((t) => t.text).join(" \n ");

  return {
    needIdentified: NEED.test(customerText),
    valueDelivered: VALUE_OURS.test(ourText),
    priceAsked: PRICE.test(inbound) || PRICE.test(customerText),
    objection: OBJECTION.test(inbound),
    closingIntent: CLOSING_INTENT.test(inbound),
  };
}

/** Pick the furthest-justified stage. Objection takes precedence (must be
 *  handled before closing). Closing needs value delivered + intent/price. */
export function pickStage(history: Turn[], s: StageSignals): Stage {
  const customerTurns = history.filter((t) => t.role === "customer").length;

  if (s.objection) return "objection";
  if (s.closingIntent || (s.valueDelivered && s.priceAsked)) return "closing";
  if (s.needIdentified && !s.valueDelivered) return "value";
  if (s.needIdentified && s.valueDelivered) return "closing";
  if (customerTurns >= 1 || s.needIdentified) return "discovery";
  return "rapport";
}

const GUIDANCE: Record<Stage, string> = {
  rapport: "Tahap RAPPORT: sapa hangat & cairkan suasana. JANGAN jualan/harga. Tutup dengan 1 pertanyaan ringan.",
  discovery: "Tahap GALI KEBUTUHAN: gali pain spesifik pakai pertanyaan PILIHAN (a/b). JANGAN pitch produk / sebut harga.",
  value: "Tahap VALUE: bangun dulu 'biaya masalah' (worth of cost), lalu sampaikan 1 value paling relevan. JANGAN sebut harga.",
  objection: "Tahap OBJECTION: validasi perasaan dgn empati, lalu tanya balik / reframe keberatannya. Jangan defensif.",
  closing: "Tahap CLOSING: pakai 1 teknik closing yang cocok dengan sinyal, arahkan ke aksi (pertanyaan pilihan yang menutup).",
};

const HANDOFF = /\b(komplain|refund|kecewa|tipu|bicara orang|bicara manusia|orang asli|cs nya mana|lawyer)\b/i;

export function decide(
  current: Stage | undefined,
  history: Turn[],
  inbound: string,
): StageDecision {
  const signals = detectSignals(history, inbound);
  const picked = pickStage(history, signals);
  // Never move backwards past closing once reached (sticky closing) unless a new
  // objection appears — keeps the flow from oscillating.
  const stage: Stage = current === "closing" && !signals.objection ? "closing" : picked;

  const priceGateOpen = signals.needIdentified && signals.valueDelivered;

  let nextAction: NextAction;
  if (HANDOFF.test(inbound)) nextAction = "handoff";
  else if (stage === "closing") nextAction = "close";
  else if (stage === "objection") nextAction = "objection";
  else if (stage === "value") nextAction = "value";
  else nextAction = "gali";

  const priceLine = priceGateOpen
    ? "Harga BOLEH disebut sekarang, anchor ke value / biaya masalah (worth of cost)."
    : "JANGAN sebut harga. Kalau ditanya harga, BRIDGE ke kebutuhan dulu (jangan nolak, jangan kasih angka).";

  return {
    stage,
    priceGateOpen,
    nextAction,
    guidance: `${GUIDANCE[stage]} ${priceLine}`,
  };
}
