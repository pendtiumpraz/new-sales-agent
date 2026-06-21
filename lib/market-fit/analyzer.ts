// Market-Fit Analyzer engine. AI path (DeepSeek) with a deterministic heuristic
// fallback so it still works offline / when credit is out. Never throws.

import { meteredGenerateText } from "@/lib/ai/meter";
import { SAFETY_RULES, wrapUntrusted } from "@/lib/ai/safety";
import { stripMarkdown } from "@/lib/ai/sanitize";
import type { TenantContext } from "@/lib/db/tenant-context";
import type {
  MarketFitInput,
  MarketFitResult,
  MarketFitSegmentScore,
} from "@/lib/types/market-fit";

const B2B_WORDS = [
  "perusahaan", "korporat", "enterprise", "tim", "karyawan", "kantor",
  "procurement", "b2b", "lisensi", "saas", "vendor", "distributor", "klien",
  "instansi", "bisnis", "pabrik", "wholesale", "grosir", "reseller",
];
const B2C_WORDS = [
  "konsumen", "pelanggan", "personal", "individu", "retail", "rumah",
  "keluarga", "skincare", "makanan", "fashion", "pengguna", "member", "b2c",
  "eceran", "harian", "pribadi",
];

function countHits(text: string, words: string[]): number {
  const t = text.toLowerCase();
  return words.reduce((n, w) => (t.includes(w) ? n + 1 : n), 0);
}

function firstNumber(s?: string): number | null {
  const m = (s ?? "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** Deterministic classification — no AI. */
export function heuristicMarketFit(input: MarketFitInput): MarketFitResult {
  const blob = `${input.productName} ${input.productDescription} ` +
    input.segments.map((s) => `${s.label} ${s.description ?? ""}`).join(" ");
  const b2b = countHits(blob, B2B_WORDS);
  const b2c = countHits(blob, B2C_WORDS);

  let marketType: MarketFitResult["marketType"] = "mix";
  if (b2b >= b2c + 2) marketType = "B2B";
  else if (b2c >= b2b + 2) marketType = "B2C";
  const margin = Math.abs(b2b - b2c);
  const confidence = Math.min(95, 45 + margin * 12);

  const segmentFit: MarketFitSegmentScore[] = input.segments.map((s) => {
    const head = firstNumber(s.headcountBand);
    let score = 55;
    let reason = "fit netral";
    if (marketType === "B2B" && head !== null) {
      score = head >= 200 ? 88 : head >= 30 ? 78 : 60;
      reason = `B2B — ukuran ${s.headcountBand ?? "?"} cocok`;
    } else if (marketType === "B2C") {
      score = head !== null && head <= 10 ? 82 : 68;
      reason = "B2C — konsumen/segmen kecil";
    }
    return { label: s.label, score, reason };
  });

  return {
    marketType,
    confidence,
    icp: {
      industri: [],
      ukuran: marketType === "B2B" ? "perusahaan menengah–besar" : "konsumen individu",
      jabatanPIC: marketType === "B2B" ? ["Owner", "Manager", "Procurement"] : [],
      demografi: marketType === "B2C" ? "konsumen sesuai segmen produk" : "",
      minat: [],
    },
    segmentFit,
    rationale:
      `Heuristik: ${b2b} sinyal B2B vs ${b2c} sinyal B2C dari deskripsi produk & segmen.`,
    source: "heuristic",
  };
}

function extractJson(text: string): Record<string, unknown> | null {
  const m = (text ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function coerceResult(
  o: Record<string, unknown>,
  fallback: MarketFitResult,
): MarketFitResult | null {
  const mt = o.marketType;
  if (mt !== "B2B" && mt !== "B2C" && mt !== "mix") return null;
  const icpIn = (o.icp ?? {}) as Record<string, unknown>;
  const segIn = Array.isArray(o.segmentFit) ? o.segmentFit : [];
  return {
    marketType: mt,
    confidence: typeof o.confidence === "number" ? o.confidence : fallback.confidence,
    icp: {
      industri: Array.isArray(icpIn.industri) ? (icpIn.industri as string[]) : [],
      ukuran: typeof icpIn.ukuran === "string" ? icpIn.ukuran : fallback.icp.ukuran,
      jabatanPIC: Array.isArray(icpIn.jabatanPIC) ? (icpIn.jabatanPIC as string[]) : [],
      demografi: typeof icpIn.demografi === "string" ? icpIn.demografi : "",
      minat: Array.isArray(icpIn.minat) ? (icpIn.minat as string[]) : [],
    },
    segmentFit: segIn
      .map((s): MarketFitSegmentScore | null => {
        const r = s as Record<string, unknown>;
        if (typeof r.label !== "string") return null;
        return {
          label: r.label,
          score: typeof r.score === "number" ? Math.max(0, Math.min(100, r.score)) : 50,
          reason: typeof r.reason === "string" ? r.reason : "",
        };
      })
      .filter((x): x is MarketFitSegmentScore => x !== null),
    rationale: typeof o.rationale === "string" ? o.rationale : fallback.rationale,
    source: "ai",
  };
}

/** Analyze market fit. Tries the AI, falls back to the heuristic. Never throws. */
export async function analyzeMarketFit(
  ctx: TenantContext,
  input: MarketFitInput,
): Promise<MarketFitResult> {
  const fallback = heuristicMarketFit(input);

  const segLines = input.segments
    .map((s) => `- ${s.label}: ${s.description ?? ""} (${s.headcountBand ?? "?"}, ${s.revenueBand ?? "?"})`)
    .join("\n");

  try {
    const { text } = await meteredGenerateText(ctx, {
      feature: "market_fit",
      system:
        `Kamu analis market-fit. Tentukan apakah produk ini B2B, B2C, atau mix, ` +
        `lalu ICP-nya dan skor fit (0-100) tiap segmen. ` +
        `Balas HANYA JSON valid (tanpa markdown) dengan bentuk: ` +
        `{"marketType":"B2B|B2C|mix","confidence":0-100,"icp":{"industri":[],"ukuran":"","jabatanPIC":[],"demografi":"","minat":[]},"segmentFit":[{"label":"","score":0,"reason":""}],"rationale":""}. ` +
        SAFETY_RULES,
      prompt:
        `Produk: ${input.productName} — ${input.productDescription}\n\nSegmen:\n` +
        wrapUntrusted("segmen", segLines || "(tidak ada)"),
      maxOutputTokens: 700,
    });
    const parsed = extractJson(stripMarkdown(text ?? ""));
    const coerced = parsed ? coerceResult(parsed, fallback) : null;
    return coerced ?? fallback;
  } catch {
    return fallback;
  }
}
