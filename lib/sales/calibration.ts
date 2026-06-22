// Calibration (Phase 4 / G7). Turns the recorded outcomes into the EMPIRICAL
// close rate per readiness band — i.e. "of chats that were 'panas', how many
// actually closed?". This is the honest feedback loop: not a trained model, but a
// real, tenant-specific accuracy signal derived from outcomes, surfaced next to
// the heuristic score so reps trust (or discount) it appropriately.

import type { ReadinessBand } from "@/lib/sales/predictive";
import type { OutcomeRecord } from "@/lib/sales/outcome-store";

export interface BandStat {
  band: ReadinessBand;
  n: number; // outcomes recorded in this band
  won: number;
  closeRate: number | null; // won / n, or null when n === 0
}

export interface Calibration {
  total: number;
  ready: boolean; // enough data overall to be meaningful
  minSamples: number;
  byBand: BandStat[];
}

const MIN_SAMPLES = 10; // tenant-wide threshold before we call calibration "ready"
const MIN_BAND_SAMPLES = 3; // per-band threshold before a close rate means anything

const BANDS: ReadinessBand[] = ["dingin", "hangat", "panas"];

export function computeCalibration(records: OutcomeRecord[]): Calibration {
  const byBand = BANDS.map((band) => {
    const inBand = records.filter((r) => r.band === band);
    const n = inBand.length;
    const won = inBand.filter((r) => r.outcome === "won").length;
    return { band, n, won, closeRate: n > 0 ? won / n : null };
  });
  return { total: records.length, ready: records.length >= MIN_SAMPLES, minSamples: MIN_SAMPLES, byBand };
}

// The empirical close rate for a band, only when there's enough data to mean
// something. Used to annotate a live readiness score.
export function closeRateForBand(cal: Calibration, band: ReadinessBand): { closeRate: number; n: number } | null {
  const s = cal.byBand.find((b) => b.band === band);
  if (!s || s.closeRate === null || s.n < MIN_BAND_SAMPLES) return null;
  return { closeRate: s.closeRate, n: s.n };
}
