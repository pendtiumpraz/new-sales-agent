/**
 * Pure, DETERMINISTIC closing-flow logic (no DB, no AI). The stage-machine picks
 * a conversation's stage from message signals, and the readiness scorer derives a
 * 0..100 score + band + next-best-action. This is the heuristic core that ALWAYS
 * works with NO AI keys; the service may optionally call the model to refine the
 * stage, but it falls back to these functions.
 *
 * Reused (clean) from the prototype's `lib/sales/stage-machine.ts` +
 * `lib/sales/predictive.ts`, restated with the rebuild's vocabulary (stages
 * rapport|discovery|value|objection|closing; bands cold|warm|hot).
 */

export type Stage = "rapport" | "discovery" | "value" | "objection" | "closing";
export type NextAction = "nurture" | "gali" | "value" | "objection" | "close" | "handoff";
export type ReadinessBand = "cold" | "warm" | "hot";

export const STAGES: readonly Stage[] = [
  "rapport",
  "discovery",
  "value",
  "objection",
  "closing",
] as const;

/** A single turn in the transcript (customer = inbound, us = outbound). */
export interface Turn {
  role: "customer" | "us";
  text: string;
}

/** The signals the heuristic detects from the transcript. */
export interface StageSignals {
  needIdentified: boolean;
  valueDelivered: boolean;
  priceAsked: boolean;
  objection: boolean;
  closingIntent: boolean;
}

export interface StageDecision {
  stage: Stage;
  previousStage: Stage | null;
  nextAction: NextAction;
  /** Price may be stated only when need + value are satisfied. */
  priceGateOpen: boolean;
  /** Stage-specific instruction (system-prompt snippet). */
  guidance: string;
  signals: StageSignals;
  /** Customer turns observed (drives scoring). */
  turns: number;
}

export interface NextBestAction {
  action: NextAction;
  suggestion: string;
}

export interface Readiness {
  score: number; // 0..100
  band: ReadinessBand;
  factors: string[];
  nba: NextBestAction;
}

// ── signal lexicons (Bahasa Indonesia-first, heuristic) ──────────────────────
const NEED =
  /\b(masalah|butuh|perlu|pengen|pengin|kepengen|mau|kendala|susah|capek|bingung|cari|kesulitan|target|pusing)\b/i;
const VALUE_OURS =
  /\b(bisa bantu|manfaat|solusi|hasil|keuntungan|beda|unggul|hemat|untung|value|kelebihan)\b/i;
const PRICE = /\b(harga|berapa|biaya|tarif|bayar|mahal|murah|diskon|promo)\b/i;
const OBJECTION =
  /\b(mahal|kemahalan|mikir dulu|pikir-pikir|nanti dulu|ragu|belum yakin|bandingkan|kompetitor|nego|kurang)\b/i;
const CLOSING_INTENT =
  /\b(oke|ok|sip|deal|mau ambil|jadi ambil|beli|pesan|order|lanjut|gas|gimana cara|caranya|transfer|checkout)\b/i;
const HANDOFF =
  /\b(komplain|refund|kecewa|tipu|bicara orang|bicara manusia|orang asli|cs nya mana|lawyer)\b/i;

/** Detect the closing-flow signals from the transcript + the latest inbound. */
export function detectSignals(history: Turn[], inbound: string): StageSignals {
  const customerText = [
    ...history.filter((t) => t.role === "customer").map((t) => t.text),
    inbound,
  ].join(" \n ");
  const ourText = history
    .filter((t) => t.role === "us")
    .map((t) => t.text)
    .join(" \n ");

  return {
    needIdentified: NEED.test(customerText),
    valueDelivered: VALUE_OURS.test(ourText),
    priceAsked: PRICE.test(inbound) || PRICE.test(customerText),
    objection: OBJECTION.test(inbound),
    closingIntent: CLOSING_INTENT.test(inbound),
  };
}

/**
 * Pick the furthest-justified stage. Objection takes precedence (must be handled
 * before closing). Closing needs value delivered + intent/price.
 */
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
  rapport:
    "Tahap RAPPORT: sapa hangat & cairkan suasana. JANGAN jualan/harga. Tutup dengan 1 pertanyaan ringan.",
  discovery:
    "Tahap GALI KEBUTUHAN: gali pain spesifik pakai pertanyaan PILIHAN (a/b). JANGAN pitch produk / sebut harga.",
  value:
    "Tahap VALUE: bangun dulu 'biaya masalah' (worth of cost), lalu sampaikan 1 value paling relevan. JANGAN sebut harga.",
  objection:
    "Tahap OBJECTION: validasi perasaan dgn empati, lalu tanya balik / reframe keberatannya. Jangan defensif.",
  closing:
    "Tahap CLOSING: pakai 1 teknik closing yang cocok dengan sinyal, arahkan ke aksi (pertanyaan pilihan yang menutup).",
};

/**
 * Decide the stage for a conversation. `current` is the previously stored stage
 * (sticky-closing: once closing is reached, don't oscillate back unless a new
 * objection appears). Deterministic — no AI cost.
 */
export function decideStage(
  current: Stage | undefined | null,
  history: Turn[],
  inbound: string,
): StageDecision {
  const signals = detectSignals(history, inbound);
  const picked = pickStage(history, signals);
  // Never move backwards past closing once reached (sticky) unless a NEW objection
  // appears — keeps the flow from oscillating.
  const stage: Stage = current === "closing" && !signals.objection ? "closing" : picked;
  const turns = history.filter((t) => t.role === "customer").length;

  const priceGateOpen = signals.needIdentified && signals.valueDelivered;

  let nextAction: NextAction;
  if (HANDOFF.test(inbound)) nextAction = "handoff";
  else if (stage === "closing") nextAction = "close";
  else if (stage === "objection") nextAction = "objection";
  else if (stage === "value") nextAction = "value";
  else if (stage === "discovery") nextAction = "gali";
  else nextAction = "nurture";

  const priceLine = priceGateOpen
    ? "Harga BOLEH disebut sekarang, anchor ke value / biaya masalah (worth of cost)."
    : "JANGAN sebut harga. Kalau ditanya harga, BRIDGE ke kebutuhan dulu (jangan nolak, jangan kasih angka).";

  return {
    stage,
    previousStage: current ?? null,
    nextAction,
    priceGateOpen,
    guidance: `${GUIDANCE[stage]} ${priceLine}`,
    signals,
    turns,
  };
}

const STAGE_BASE: Record<Stage, number> = {
  rapport: 10,
  discovery: 30,
  value: 50,
  objection: 45,
  closing: 75,
};

/**
 * Score closing-readiness 0..100 + band + next-best-action from the stage +
 * signals. HONEST: heuristic, not a trained model. Deterministic — no AI cost.
 */
export function scoreReadiness(
  stage: Stage,
  s: StageSignals,
  customerTurns: number,
): Readiness {
  let score = STAGE_BASE[stage];
  const factors: string[] = [];

  if (s.needIdentified) {
    score += 12;
    factors.push("kebutuhan teridentifikasi");
  }
  if (s.valueDelivered) {
    score += 12;
    factors.push("value tersampaikan");
  }
  if (s.closingIntent) {
    score += 18;
    factors.push("ada sinyal mau closing");
  }
  if (s.priceAsked) {
    score += 6;
    factors.push("menanyakan harga");
  }
  if (s.objection) {
    score -= 12;
    factors.push("ada keberatan");
  }
  if (customerTurns >= 4) {
    score += 5;
    factors.push("engaged (banyak balasan)");
  }
  if (customerTurns === 0) {
    score -= 8;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band: ReadinessBand = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";

  let nba: NextBestAction;
  if (s.objection) {
    nba = {
      action: "objection",
      suggestion: "Validasi keberatannya dengan empati, lalu reframe — jangan defensif.",
    };
  } else if (stage === "closing") {
    nba = {
      action: "close",
      suggestion: "Tawarkan pilihan yang menutup (a/b) + 1 teknik closing yang cocok.",
    };
  } else if (stage === "value") {
    nba = {
      action: "value",
      suggestion:
        "Bangun biaya-masalah (worth of cost), sampaikan 1 value relevan. Belum harga.",
    };
  } else if (stage === "discovery") {
    nba = {
      action: "gali",
      suggestion: "Gali pain spesifik pakai pertanyaan pilihan (a/b).",
    };
  } else {
    nba = {
      action: "nurture",
      suggestion: "Cairkan dulu, bangun rapport sebelum mulai jualan.",
    };
  }

  return { score, band, factors, nba };
}

/** Coerce arbitrary `signals` jsonb back into a typed StageSignals (defaults false). */
export function normalizeSignals(raw: Record<string, unknown> | null | undefined): StageSignals {
  const r = raw ?? {};
  return {
    needIdentified: Boolean(r.needIdentified),
    valueDelivered: Boolean(r.valueDelivered),
    priceAsked: Boolean(r.priceAsked),
    objection: Boolean(r.objection),
    closingIntent: Boolean(r.closingIntent),
  };
}
