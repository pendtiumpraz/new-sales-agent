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

export interface TrendPoint {
  period: string; // ISO date of the week's Monday (YYYY-MM-DD)
  total: number;
  won: number;
  closeRate: number; // 0..1
}

// Win-rate trend, bucketed by week (Monday-start, UTC). Last `weeks` buckets that
// actually have outcomes — the dashboard line.
export function computeTrend(records: OutcomeRecord[], weeks = 8): TrendPoint[] {
  const byWeek = new Map<string, { total: number; won: number }>();
  for (const r of records) {
    const d = new Date(r.ts);
    if (Number.isNaN(d.getTime())) continue;
    const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
    const key = monday.toISOString().slice(0, 10);
    const b = byWeek.get(key) ?? { total: 0, won: 0 };
    b.total += 1;
    if (r.outcome === "won") b.won += 1;
    byWeek.set(key, b);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-weeks)
    .map(([period, b]) => ({ period, total: b.total, won: b.won, closeRate: b.total ? b.won / b.total : 0 }));
}
