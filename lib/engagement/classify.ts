import { meteredGenerateText } from "@/lib/ai/meter";
import type { TenantContext } from "@/lib/db/tenant-context";

// B2C-customer vs B2B-partner lead classifier (doc 40). Decides whether a
// crawled person is more likely a DIRECT CUSTOMER of the tenant's product
// (b2c_customer) or a BUSINESS PARTNER / distributor / reseller (b2b_partner),
// grounded in their role + company + industry + track record. Metered AI with a
// deterministic heuristic fallback — never dummy.

export interface LeadClassification {
  leadType: "b2c_customer" | "b2b_partner" | "unknown";
  reason: string;
  score: number; // 0..1 confidence
}

export interface ClassifyInput {
  fullName: string;
  title?: string | null;
  company?: string | null;
  industry?: string | null;
  experience?: { title?: string; company?: string; period?: string }[];
  product?: string | null; // what the tenant sells (grounds the decision)
}

// Role keywords that strongly signal a B2B partner (procurement / channel side).
const PARTNER_KEYWORDS = [
  "procurement", "purchasing", "pengadaan", "partnership", "partner",
  "distributor", "distribusi", "reseller", "channel", "wholesale", "grosir",
  "vendor", "supplier", "pemasok", "agen", "agency", "mitra", "principal",
  "business development", "bizdev", "trading", "importir", "eksportir",
];

export function heuristicClassify(input: ClassifyInput): LeadClassification {
  const hay = [input.title, input.company, input.industry, ...(input.experience ?? []).map((e) => e.title)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const partnerHit = PARTNER_KEYWORDS.find((k) => hay.includes(k));
  if (partnerHit) {
    return {
      leadType: "b2b_partner",
      reason: `Peran "${partnerHit}" mengindikasikan sisi pengadaan/kanal — berpotensi sebagai partner/distributor B2B.`,
      score: 0.55,
    };
  }
  if (input.title) {
    return {
      leadType: "b2c_customer",
      reason: `Jabatan "${input.title}" tampak sebagai pengguna/pengambil keputusan langsung — berpotensi sebagai customer.`,
      score: 0.45,
    };
  }
  return {
    leadType: "unknown",
    reason: "Sinyal jabatan/industri belum cukup untuk mengklasifikasi — perlu enrich lebih lanjut.",
    score: 0.2,
  };
}

function parseJson(text: string): Partial<LeadClassification> | null {
  // tolerate ```json fences or stray prose around the object
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export async function classifyLead(ctx: TenantContext, input: ClassifyInput): Promise<LeadClassification> {
  const track = (input.experience ?? [])
    .slice(0, 5)
    .map((e) => [e.title, e.company, e.period].filter(Boolean).join(" @ "))
    .filter(Boolean)
    .join("; ");

  try {
    const { text } = await meteredGenerateText(ctx, {
      feature: "classify",
      system:
        `Kamu analis sales B2B/B2C berpengalaman. Tugasmu menilai apakah seseorang lebih cocok sebagai ` +
        `CUSTOMER langsung (b2c_customer) atau PARTNER/distributor/reseller bisnis (b2b_partner) bagi produk tenant. ` +
        `Hanya berdasar data yang diberikan — JANGAN mengarang fakta. Jika sinyal lemah, jawab "unknown". ` +
        `Balas HANYA JSON: {"leadType":"b2c_customer|b2b_partner|unknown","reason":"<1-2 kalimat Bahasa Indonesia yang actionable untuk sales>","score":<0..1>}.`,
      prompt:
        `Produk tenant: ${input.product || "(tidak disebutkan — nilai secara umum)"}.\n` +
        `Nama: ${input.fullName}\n` +
        `Jabatan: ${input.title || "-"}\n` +
        `Perusahaan: ${input.company || "-"}\n` +
        `Industri: ${input.industry || "-"}\n` +
        `Track record: ${track || "-"}\n` +
        `Klasifikasikan.`,
      maxOutputTokens: 250,
    });
    const parsed = text ? parseJson(text) : null;
    const lt = parsed?.leadType;
    if (lt === "b2c_customer" || lt === "b2b_partner" || lt === "unknown") {
      const score = typeof parsed?.score === "number" ? Math.max(0, Math.min(1, parsed.score)) : 0.6;
      return { leadType: lt, reason: (parsed?.reason || "").trim() || heuristicClassify(input).reason, score };
    }
  } catch {
    // no active model / suspended / parse fail → heuristic
  }
  return heuristicClassify(input);
}
