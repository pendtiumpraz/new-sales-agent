// Predictive scoring (Phase 4). Closing-readiness 0–100 + next-best-action,
// derived from the state-machine signals + stage. HONEST: heuristic, not a
// trained model — gets better as we collect outcome data (loop is future work).

import type { Stage, StageSignals } from "@/lib/sales/stage-machine";

export type ReadinessBand = "dingin" | "hangat" | "panas";

export interface NextBestAction {
  action: "nurture" | "gali" | "value" | "objection" | "close" | "handoff";
  suggestion: string;
}

export interface Readiness {
  /** 0–100 closing-readiness. */
  score: number;
  band: ReadinessBand;
  /** Human-readable drivers of the score. */
  factors: string[];
  nba: NextBestAction;
}

const STAGE_BASE: Record<Stage, number> = {
  rapport: 10,
  discovery: 30,
  value: 50,
  objection: 45,
  closing: 75,
};

export function scoreReadiness(
  stage: Stage,
  s: StageSignals,
  customerTurns: number,
): Readiness {
  let score = STAGE_BASE[stage];
  const factors: string[] = [];

  if (s.needIdentified) { score += 12; factors.push("kebutuhan teridentifikasi"); }
  if (s.valueDelivered) { score += 12; factors.push("value tersampaikan"); }
  if (s.closingIntent) { score += 18; factors.push("ada sinyal mau closing"); }
  if (s.priceAsked) { score += 6; factors.push("menanyakan harga"); }
  if (s.objection) { score -= 12; factors.push("ada keberatan"); }
  if (customerTurns >= 4) { score += 5; factors.push("engaged (banyak balasan)"); }
  if (customerTurns === 0) { score -= 8; }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band: ReadinessBand = score >= 70 ? "panas" : score >= 40 ? "hangat" : "dingin";

  let nba: NextBestAction;
  if (s.objection) {
    nba = { action: "objection", suggestion: "Validasi keberatannya dengan empati, lalu reframe — jangan defensif." };
  } else if (stage === "closing") {
    nba = { action: "close", suggestion: "Tawarkan pilihan yang menutup (a/b) + 1 teknik closing yang cocok." };
  } else if (stage === "value") {
    nba = { action: "value", suggestion: "Bangun biaya-masalah (worth of cost), sampaikan 1 value relevan. Belum harga." };
  } else if (stage === "discovery") {
    nba = { action: "gali", suggestion: "Gali pain spesifik pakai pertanyaan pilihan (a/b)." };
  } else {
    nba = { action: "nurture", suggestion: "Cairkan dulu, bangun rapport sebelum mulai jualan." };
  }

  return { score, band, factors, nba };
}
