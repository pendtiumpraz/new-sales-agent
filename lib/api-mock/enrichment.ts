// Enrichment Data (Wave 2A) — mock data for the AI-analysis layer that sits
// on top of the existing Pipeline deals. Reads from "@/lib/api-mock/data" in
// read-only mode (we never mutate the shared deals array).

import { deals as seedDeals } from "@/lib/api-mock/data";
import type { AiTemp, DealStage } from "@/lib/types";
import type {
  EnrichmentCompanySize,
  EnrichmentDealAnalysis,
  EnrichmentProduct,
} from "@/lib/types/enrichment";

// Fixed "today" for the demo so derived stats are stable across reloads.
const TODAY = Date.parse("2026-05-29T00:00:00+07:00");

// ---- Products -------------------------------------------------------------

export const seedProducts: EnrichmentProduct[] = [
  {
    id: "pd_starter",
    name: "Paket Starter",
    description: "CRM + WhatsApp inbox untuk tim sales kecil. Onboarding 7 hari.",
    priceIDR: 4_500_000,
    targetSegment: "UMKM",
    targetCompanySize: ["1-10", "11-50"],
    accent: "#14B8A6",
  },
  {
    id: "pd_growth",
    name: "Paket Growth",
    description: "Cadence outbound + Apollo-like enrichment + skor AI prospek.",
    priceIDR: 12_500_000,
    targetSegment: "Menengah",
    targetCompanySize: ["11-50", "51-200"],
    accent: "#FB5E3B",
  },
  {
    id: "pd_enterprise",
    name: "Paket Enterprise",
    description: "Multi-tim, SSO, audit log, dan integrasi data warehouse.",
    priceIDR: 48_000_000,
    targetSegment: "Enterprise",
    targetCompanySize: ["201-500", "500+"],
    accent: "#6366F1",
  },
  {
    id: "pd_wa_api",
    name: "Modul WhatsApp API",
    description: "Broadcast resmi, template, dan auto-reply AI bersertifikat Meta.",
    priceIDR: 8_500_000,
    targetSegment: "Menengah",
    targetCompanySize: ["11-50", "51-200", "201-500"],
    accent: "#25D366",
  },
  {
    id: "pd_compliance",
    name: "Modul Compliance UU PDP",
    description: "Manajemen consent, DPIA, audit vendor — wajib bagi data sensitif.",
    priceIDR: 18_000_000,
    targetSegment: "Enterprise",
    targetCompanySize: ["51-200", "201-500", "500+"],
    accent: "#8B5CF6",
  },
  {
    id: "pd_training",
    name: "Pelatihan Tim Sales",
    description: "Workshop 2 hari + playbook adopsi AI untuk tim sales lapangan.",
    priceIDR: 22_500_000,
    targetSegment: "Menengah",
    targetCompanySize: ["11-50", "51-200", "201-500"],
    accent: "#F59E0B",
  },
];

// ---- Helpers --------------------------------------------------------------

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length];
}

const SIZE_BANDS: EnrichmentCompanySize[] = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "500+",
];

/** Roughly map an IDR deal value to a plausible company size band. */
function sizeFromValue(value: number): EnrichmentCompanySize {
  if (value < 600_000_000) return "1-10";
  if (value < 900_000_000) return "11-50";
  if (value < 1_300_000_000) return "51-200";
  if (value < 1_600_000_000) return "201-500";
  return "500+";
}

function tempFromScore(score: number): AiTemp {
  return score >= 75 ? "panas" : score >= 50 ? "hangat" : "dingin";
}

const SUGGESTIONS_BY_STAGE: Record<DealStage, string[]> = {
  prospek: [
    "Kirim pesan pembuka WhatsApp dan tawarkan demo 15 menit.",
    "Sambut dengan studi kasus dari industri yang sama.",
    "Tawarkan trial 14 hari — segmen ini biasanya konversi cepat.",
  ],
  kualifikasi: [
    "Telepon untuk konfirmasi anggaran & timeline pembelian.",
    "Kirim ROI calculator — perusahaan menengah perlu data konkret.",
    "Jadwalkan discovery call 30 menit dengan PIC teknis.",
  ],
  penawaran: [
    "Follow up penawaran dalam 48 jam + lampirkan studi kasus sejenis.",
    "Tawarkan paket Growth — fit untuk perusahaan 50–100 karyawan.",
    "Sertakan harga indikatif via WhatsApp — buka diskusi negosiasi.",
  ],
  negosiasi: [
    "Tawarkan diskon tahunan dan jadwalkan closing call minggu ini.",
    "Bundle dengan Modul Compliance untuk meningkatkan nilai deal.",
    "Naikkan ke direktur jika negosiasi mandek > 7 hari.",
  ],
  tutup: [
    "Kirim materi onboarding dan minta referral ke 2 kontak.",
    "Jadwalkan kickoff call dengan tim implementasi.",
    "Pasang sebagai studi kasus — referensi kuat untuk segmen serupa.",
  ],
};

const DROPPED_SUGGESTIONS = [
  "Re-engage via WhatsApp — sudah berhenti > 14 hari.",
  "Coba sequence pendinginan dengan konten edukasi.",
  "Tawarkan diskon terbatas untuk membangunkan minat.",
];

/** Match products to a deal by company size + value band. */
function matchProducts(
  size: EnrichmentCompanySize,
  value: number,
  products: EnrichmentProduct[],
): string[] {
  const matched = products.filter((p) => p.targetCompanySize.includes(size));
  // Rank by closeness of price to deal value (cheaper than deal value).
  const ranked = matched
    .map((p) => ({ p, gap: Math.abs(value / 100 - p.priceIDR) }))
    .sort((a, b) => a.gap - b.gap)
    .map((r) => r.p.id);
  // Always keep at most 2; if zero matched (shouldn't happen), fall back to Growth.
  return ranked.length > 0 ? ranked.slice(0, 2) : ["pd_growth"];
}

// ---- Build analyses -------------------------------------------------------

/**
 * Build deterministic analyses for the seed deals in lib/api-mock/data.ts.
 * `lastActivity` is computed from a deterministic hash so it stays stable
 * across reloads (some deals will be > 14 days old → status "berhenti").
 */
export function buildAnalyses(
  products: EnrichmentProduct[] = seedProducts,
): EnrichmentDealAnalysis[] {
  return seedDeals.map((d) => {
    const h = hash(d.id);
    // Score baseline 35..89, biased a little by stage progression.
    const stageBoost =
      d.stage === "tutup"
        ? 12
        : d.stage === "negosiasi"
          ? 8
          : d.stage === "penawaran"
            ? 4
            : 0;
    const priorityScore = Math.max(
      18,
      Math.min(98, 35 + (h % 55) + stageBoost),
    );
    // Days since last activity, 1..28 — some will be > 14 (berhenti).
    const daysSince = 1 + ((h >> 4) % 28);
    const lastActivity = new Date(
      TODAY - daysSince * 86_400_000,
    ).toISOString();
    const status = daysSince > 14 ? "berhenti" : "aktif";
    // Days in current stage, 1..21.
    const daysInStage = 1 + ((h >> 8) % 21);
    const size = sizeFromValue(d.value);
    const matched = matchProducts(size, d.value, products);
    const suggestionPool =
      status === "berhenti" ? DROPPED_SUGGESTIONS : SUGGESTIONS_BY_STAGE[d.stage];
    const aiSuggestion = pick(suggestionPool, h >> 12);

    return {
      dealId: d.id,
      priorityScore,
      temperature: tempFromScore(priorityScore),
      status,
      lastActivity,
      daysInStage,
      stage: d.stage,
      aiSuggestion,
      matchedProducts: matched,
      companySize: size,
    };
  });
}

// Pre-seeded analyses (immutable — store hydrates from this).
export const seedAnalyses: EnrichmentDealAnalysis[] = buildAnalyses(seedProducts);

/**
 * REAL analyses derived from actual deals (no hash/dummy): priorityScore from the
 * deal value (relative to the set) + stage progression; daysInStage from the deal's
 * real updatedAt; status from staleness; aiSuggestion is the stage's first
 * (deterministic) tip; matchedProducts from value→size product-fit. Used by the
 * pipeline store once real deals hydrate from /api/db/deals.
 */
export function deriveAnalyses(
  deals: { id: string; value: number; stage: DealStage; updatedAt?: string | Date | null }[],
  products: EnrichmentProduct[] = seedProducts,
): EnrichmentDealAnalysis[] {
  const now = Date.now();
  const maxValue = Math.max(1, ...deals.map((d) => d.value || 0));
  return deals.map((d) => {
    const stageBoost = d.stage === "tutup" ? 25 : d.stage === "negosiasi" ? 18 : d.stage === "penawaran" ? 12 : d.stage === "kualifikasi" ? 6 : 0;
    const valueScore = Math.round(((d.value || 0) / maxValue) * 55); // 0..55 from REAL value
    const priorityScore = Math.max(10, Math.min(98, 20 + valueScore + stageBoost));
    const updated = d.updatedAt ? new Date(d.updatedAt).getTime() : now;
    const daysInStage = Math.max(0, Math.round((now - updated) / 86_400_000));
    const status = daysInStage > 14 ? "berhenti" : "aktif";
    const size = sizeFromValue(d.value || 0);
    const pool = status === "berhenti" ? DROPPED_SUGGESTIONS : SUGGESTIONS_BY_STAGE[d.stage];
    return {
      dealId: d.id,
      priorityScore,
      temperature: tempFromScore(priorityScore),
      status,
      lastActivity: new Date(updated).toISOString(),
      daysInStage,
      stage: d.stage,
      aiSuggestion: pool[0], // deterministic, stage-appropriate — not random
      matchedProducts: matchProducts(size, d.value || 0, products),
      companySize: size,
    };
  });
}

// ---- Read-only helpers ----------------------------------------------------

export function productById(
  id: string,
  products: EnrichmentProduct[],
): EnrichmentProduct | undefined {
  return products.find((p) => p.id === id);
}

export { SIZE_BANDS };
