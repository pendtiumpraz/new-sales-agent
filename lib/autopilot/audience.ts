import type { AutopilotRunConfig } from "@/lib/types/autopilot";

// Single source of truth for audience matching (doc — autopilot). The estimate
// shown in the hero / AudiencePicker MUST equal what a run actually selects, so
// both the UI and lib/autopilot/orchestrator import these. Previously three
// copies diverged (leading-number vs upper-bound thresholds; city substring vs
// exact-equality) → "Y prospek cocok" != "X prospek terpilih".

export type Segment = NonNullable<AutopilotRunConfig["audienceSegment"]>;

/** Classify an employee-band string into a segment. Tiers per the AudiencePicker
 *  UI: UMKM < 50, Menengah 50–250, Korporat 250+. Uses the leading number in the
 *  band (e.g. "11-50" → 11 → UMKM) plus keyword hints. */
export function classifySegment(companySize: string | null | undefined): Segment {
  const size = (companySize ?? "").toLowerCase();
  const m = size.match(/(\d+)/);
  const n = m ? Number(m[1]) : 0;
  if (size.includes("250") || size.includes("500") || size.includes("1000") || n >= 250) return "Korporat";
  if (n >= 50 || size.includes("100") || size.includes("menengah")) return "Menengah";
  return "UMKM";
}

/** Case-insensitive substring city match (empty filter = match all). */
export function cityMatches(prospectCity: string | null | undefined, wanted: string | null | undefined): boolean {
  const w = (wanted ?? "").trim().toLowerCase();
  if (!w) return true;
  return (prospectCity ?? "").toLowerCase().includes(w);
}
