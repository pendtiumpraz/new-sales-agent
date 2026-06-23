// Market-Fit Analyzer engine. AI path (DeepSeek) with a deterministic heuristic
// fallback so it still works offline / when credit is out. Never throws.

import { meteredGenerateText } from "@/lib/ai/meter";
import { SAFETY_RULES, wrapUntrusted } from "@/lib/ai/safety";
import { stripMarkdown } from "@/lib/ai/sanitize";
import type { TenantContext } from "@/lib/db/tenant-context";
import type {
  MarketFitChannelPlay,
  MarketFitIcp,
  MarketFitInput,
  MarketFitResult,
  MarketFitSegmentScore,
} from "@/lib/types/market-fit";

const uniq = (a: string[]): string[] => [...new Set(a.map((s) => s.trim()).filter(Boolean))];

// Turn the market-fit (type + ICP) into a per-channel discovery playbook: WHAT to
// search WHERE so the crawler/extension can find these leads + their email/HP.
// Used as both the heuristic output and the fallback when the AI omits it.
export function buildPlaybook(
  marketType: MarketFitResult["marketType"],
  icp: MarketFitIcp,
  productName: string,
): MarketFitChannelPlay[] {
  const prod = (productName || "produk").trim();
  const tag = prod.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "produk";
  const ind0 = icp.industri[0] ?? "";
  const indAll = icp.industri.length ? icp.industri.join(" / ") : "industri target";
  const titles = icp.jabatanPIC.length ? icp.jabatanPIC : ["Owner", "Manager", "Procurement"];
  const minat = icp.minat;

  const linkedin: MarketFitChannelPlay = {
    channel: "LinkedIn",
    jabatan: titles,
    kueri: uniq(titles.slice(0, 3).map((t) => `${t}${ind0 ? " " + ind0 : ""} Indonesia`)),
    petunjuk: "Dapat nama + perusahaan + jabatan. Email/HP via Hunter.io atau overlay kontak (koneksi 1st).",
  };
  const google: MarketFitChannelPlay = {
    channel: "Google",
    kueri: uniq([
      `${indAll} Indonesia "email" OR "kontak" -lowongan`,
      `daftar perusahaan ${ind0 || prod} Indonesia kontak`,
      `${prod} ${ind0} distributor OR reseller`,
    ]),
    petunjuk: "Buka website PT dari hasil → crawl email + nomor telepon.",
  };
  const instagram: MarketFitChannelPlay = {
    channel: "Instagram",
    kueri: uniq([`#${tag}`, ...minat.slice(0, 2).map((m) => `#${m.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`), `${prod} jual`]),
    petunjuk: "Bio akun sering cantumkan WA/email. Cari via hashtag + minat target.",
  };
  const tiktok: MarketFitChannelPlay = {
    channel: "TikTok",
    kueri: uniq([`#${tag}`, `${prod} review`, ...minat.slice(0, 1)]),
    petunjuk: "Profil/bio kreator & toko → link WA/website.",
  };
  const shopee: MarketFitChannelPlay = {
    channel: "Shopee / Tokopedia",
    kueri: uniq([prod, `${prod} grosir`, ...minat.slice(0, 1).map((m) => `${m} ${prod}`)]),
    petunjuk: "Halaman toko/seller sering ada nomor WA + kontak.",
  };

  if (marketType === "B2B") return [linkedin, google, shopee];
  if (marketType === "B2C") return [instagram, tiktok, shopee, google];
  return [linkedin, instagram, google, shopee]; // mix
}

// Parse an AI-provided channel play (untrusted) into the typed shape.
function parseChannelPlay(x: unknown): MarketFitChannelPlay | null {
  const r = (x ?? {}) as Record<string, unknown>;
  if (typeof r.channel !== "string" || !r.channel.trim()) return null;
  const kueri = Array.isArray(r.kueri) ? (r.kueri as unknown[]).map(String).map((s) => s.trim()).filter(Boolean) : [];
  if (!kueri.length) return null;
  return {
    channel: r.channel.trim(),
    kueri: kueri.slice(0, 6),
    jabatan: Array.isArray(r.jabatan) ? (r.jabatan as unknown[]).map(String).map((s) => s.trim()).filter(Boolean).slice(0, 8) : undefined,
    petunjuk: typeof r.petunjuk === "string" ? r.petunjuk.trim() : undefined,
  };
}

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

  const icp: MarketFitIcp = {
    industri: [],
    ukuran: marketType === "B2B" ? "perusahaan menengah–besar" : "konsumen individu",
    jabatanPIC: marketType === "B2B" ? ["Owner", "Manager", "Procurement"] : [],
    demografi: marketType === "B2C" ? "konsumen sesuai segmen produk" : "",
    minat: [],
  };

  return {
    marketType,
    confidence,
    icp,
    segmentFit,
    discoveryPlaybook: buildPlaybook(marketType, icp, input.productName),
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
  productName: string,
): MarketFitResult | null {
  const mt = o.marketType;
  if (mt !== "B2B" && mt !== "B2C" && mt !== "mix") return null;
  const icpIn = (o.icp ?? {}) as Record<string, unknown>;
  const segIn = Array.isArray(o.segmentFit) ? o.segmentFit : [];
  const icp: MarketFitIcp = {
    industri: Array.isArray(icpIn.industri) ? (icpIn.industri as string[]) : [],
    ukuran: typeof icpIn.ukuran === "string" ? icpIn.ukuran : fallback.icp.ukuran,
    jabatanPIC: Array.isArray(icpIn.jabatanPIC) ? (icpIn.jabatanPIC as string[]) : [],
    demografi: typeof icpIn.demografi === "string" ? icpIn.demografi : "",
    minat: Array.isArray(icpIn.minat) ? (icpIn.minat as string[]) : [],
  };
  const pbIn = Array.isArray(o.discoveryPlaybook) ? o.discoveryPlaybook : [];
  const playbook = pbIn.map(parseChannelPlay).filter((x): x is MarketFitChannelPlay => x !== null);
  return {
    marketType: mt,
    confidence: typeof o.confidence === "number" ? o.confidence : fallback.confidence,
    icp,
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
    // AI playbook if provided + valid, else derive from the (final) type + ICP.
    discoveryPlaybook: playbook.length ? playbook : buildPlaybook(mt, icp, productName),
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
        `Kamu analis market-fit + perencana akuisisi lead. Tentukan produk ini B2B/B2C/mix, ICP-nya, dan skor fit (0-100) tiap segmen. ` +
        `LALU buat "discoveryPlaybook": untuk tiap channel yang RELEVAN dengan tipe pasar ini — APA yang harus DICARI (kueri/keyword spesifik, bukan umum), untuk LinkedIn JABATAN apa yang diincar, dan petunjuk singkat. ` +
        `Channel: LinkedIn, Google, Instagram, TikTok, "Shopee / Tokopedia". B2B → utamakan LinkedIn (jabatan PIC) + Google (website PT). B2C → Instagram/TikTok (hashtag+minat) + Shopee/Tokopedia (keyword produk) + Google. ` +
        `Tujuan akhir playbook: nemu lead lalu crawling EMAIL + NOMOR HP-nya. ` +
        `Balas HANYA JSON valid (tanpa markdown) dengan bentuk: ` +
        `{"marketType":"B2B|B2C|mix","confidence":0-100,"icp":{"industri":[],"ukuran":"","jabatanPIC":[],"demografi":"","minat":[]},"segmentFit":[{"label":"","score":0,"reason":""}],"discoveryPlaybook":[{"channel":"","kueri":["..."],"jabatan":["..."],"petunjuk":"..."}],"rationale":""}. ` +
        SAFETY_RULES,
      prompt:
        `Produk: ${input.productName} — ${input.productDescription}\n\nSegmen:\n` +
        wrapUntrusted("segmen", segLines || "(tidak ada)"),
      maxOutputTokens: 1000,
    });
    const parsed = extractJson(stripMarkdown(text ?? ""));
    const coerced = parsed ? coerceResult(parsed, fallback, input.productName) : null;
    return coerced ?? fallback;
  } catch {
    return fallback;
  }
}
