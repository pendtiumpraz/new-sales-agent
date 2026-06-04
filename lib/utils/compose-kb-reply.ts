// Knowledge-Base-aware mock LLM reply composer (feature-revisions.md §4 — Gap B).
//
// Replaces the legacy rule-based `matchAiResponse` for the global AI assistant.
// Given a free-form prompt + the live `KnowledgeBase`, returns a multi-paragraph
// Bahasa Indonesia answer grounded in real KB content (products, pricing,
// segments, strategy notes, upsell rules, retention flows) + the names of the
// 2–3 KB elements cited so the UI can render a "Sumber" row.

import { formatIDR } from "@/lib/utils/format-idr";
import type {
  KbProduct,
  KbSegment,
  KbSegmentTier,
  KnowledgeBase,
} from "@/lib/types/kb";

export type KbIntent =
  | "pricing"
  | "product-fit"
  | "segment-strategy"
  | "retention"
  | "upsell"
  | "general";

export interface ComposedKbReply {
  /** Multi-paragraph Bahasa Indonesia answer. */
  body: string;
  /** 2–3 KB element names used to ground the answer. */
  sources: string[];
  /** The segment that was matched (or defaulted) for this reply. */
  segmentHit: KbSegmentTier | null;
  /** Classified intent — useful for UI affordances later. */
  intent: KbIntent;
}

// ── Intent classification ───────────────────────────────────────────────────

const PRICING_KEYWORDS = [
  "harga",
  "berapa",
  "biaya",
  "tarif",
  "price",
  "rp ",
  "rupiah",
  "paket termurah",
  "diskon",
];
const SEGMENT_KEYWORDS = [
  "umkm",
  "korporat",
  "menengah",
  "enterprise",
  "segmen",
  "warung",
  "perusahaan",
  "startup",
];
const RETENTION_KEYWORDS = [
  "ulang",
  "retensi",
  "retention",
  "loyalty",
  "loyal",
  "renewal",
  "perpanjang",
  "churn",
  "nps",
  "after-sales",
];
const UPSELL_KEYWORDS = [
  "tawar",
  "upsell",
  "upgrade",
  "naik paket",
  "add-on",
  "cross-sell",
  "tambahan",
];
const PRODUCT_KEYWORDS = [
  "produk",
  "fitur",
  "cocok",
  "rekomendasi",
  "pakai",
  "starter",
  "growth",
  "enterprise",
  "whatsapp",
  "cadence",
  "pipeline",
];

function classify(prompt: string): KbIntent {
  const p = prompt.toLowerCase();
  const hits = (kws: string[]) => kws.some((k) => p.includes(k));

  if (hits(PRICING_KEYWORDS)) return "pricing";
  if (hits(RETENTION_KEYWORDS)) return "retention";
  if (hits(UPSELL_KEYWORDS)) return "upsell";
  if (hits(PRODUCT_KEYWORDS)) return "product-fit";
  if (hits(SEGMENT_KEYWORDS)) return "segment-strategy";
  return "general";
}

// ── Segment detection ───────────────────────────────────────────────────────

function detectSegment(
  prompt: string,
  kb: KnowledgeBase,
): KbSegment | null {
  const p = prompt.toLowerCase();
  // Explicit mentions first.
  if (p.includes("umkm") || p.includes("warung") || p.includes("mikro")) {
    return kb.segments.find((s) => s.label === "UMKM") ?? null;
  }
  if (p.includes("korporat") || p.includes("enterprise") || p.includes("perusahaan besar")) {
    return kb.segments.find((s) => s.label === "Korporat") ?? null;
  }
  if (p.includes("menengah") || p.includes("startup") || p.includes("tim 15")) {
    return kb.segments.find((s) => s.label === "Menengah") ?? null;
  }
  // Heuristic: numeric headcount mentions.
  const headcount = p.match(/(\d{1,4})\s*(orang|karyawan|user|pengguna|sales)/);
  if (headcount) {
    const n = Number(headcount[1]);
    if (n <= 10) return kb.segments.find((s) => s.label === "UMKM") ?? null;
    if (n <= 200) return kb.segments.find((s) => s.label === "Menengah") ?? null;
    return kb.segments.find((s) => s.label === "Korporat") ?? null;
  }
  return null;
}

function pickPriorityProduct(
  segment: KbSegment | null,
  kb: KnowledgeBase,
): KbProduct | null {
  if (!segment) {
    return kb.products.find((p) => p.active) ?? kb.products[0] ?? null;
  }
  const priority = kb.priorityProducts.find((m) => m.segmentId === segment.id);
  const id = priority?.productIds[0];
  return (
    (id ? kb.products.find((p) => p.id === id) : null) ??
    kb.products.find((p) => p.active) ??
    kb.products[0] ??
    null
  );
}

function billingSuffix(b: "bulanan" | "tahunan" | "satu-kali"): string {
  if (b === "tahunan") return "/tahun";
  if (b === "bulanan") return "/bulan";
  return " (satu kali)";
}

// ── Intent-specific composers ───────────────────────────────────────────────

function composePricing(
  segment: KbSegment | null,
  kb: KnowledgeBase,
): { body: string; sources: string[] } {
  const seg = segment ?? kb.segments[0];
  const product = pickPriorityProduct(seg, kb);
  if (!product) {
    return {
      body:
        "Saat ini belum ada produk yang aktif di Basis Pengetahuan. Tambahkan produk + tier harga di Pengaturan agar saya bisa menjawab pertanyaan harga dengan akurat.",
      sources: [],
    };
  }
  const tiers = kb.pricing
    .filter((t) => t.productId === product.id)
    .sort((a, b) => a.priceIDR - b.priceIDR);
  const lowest = tiers[0];

  const lines: string[] = [];
  lines.push(
    seg
      ? `Untuk segmen ${seg.label}, produk prioritas yang kami rekomendasikan adalah ${product.name}.`
      : `Produk yang paling sering kami rekomendasikan adalah ${product.name}.`,
  );

  if (lowest) {
    lines.push(
      `Tier awal ${lowest.tierName} dibanderol ${formatIDR(lowest.priceIDR)}${billingSuffix(lowest.billing)}, sudah mencakup: ${lowest.features.slice(0, 3).join(", ")}.`,
    );
  }
  if (tiers.length > 1) {
    const top = tiers[tiers.length - 1];
    lines.push(
      `Untuk kebutuhan yang lebih besar, tersedia tier ${top.tierName} di ${formatIDR(top.priceIDR)}${billingSuffix(top.billing)} dengan fitur lengkap seperti ${top.features.slice(0, 2).join(" dan ")}.`,
    );
  }
  lines.push(
    "Mau saya bantu siapkan penawaran tertulis atau jadwalkan demo 15 menit?",
  );

  const sources: string[] = [product.name];
  if (lowest) sources.push(`Harga ${product.name} — ${lowest.tierName}`);
  if (seg) sources.push(`Segmen ${seg.label}`);

  return { body: lines.join("\n\n"), sources };
}

function composeProductFit(
  segment: KbSegment | null,
  kb: KnowledgeBase,
): { body: string; sources: string[] } {
  const seg = segment ?? kb.segments[0];
  const priority = seg
    ? kb.priorityProducts.find((m) => m.segmentId === seg.id)
    : null;
  const ids = priority?.productIds.slice(0, 2) ?? [];
  const products = ids
    .map((id) => kb.products.find((p) => p.id === id))
    .filter((p): p is KbProduct => Boolean(p));
  const fallback = products.length
    ? products
    : kb.products.filter((p) => p.active).slice(0, 2);

  if (fallback.length === 0) {
    return {
      body:
        "Belum ada produk aktif di Basis Pengetahuan. Tambahkan produk inti di Pengaturan supaya saya bisa memberi rekomendasi yang tepat.",
      sources: [],
    };
  }

  const lines: string[] = [];
  lines.push(
    seg
      ? `Berdasarkan profil ${seg.label} (${seg.headcountBand}), saya menyarankan ${fallback.length === 1 ? "produk" : "kombinasi produk"} berikut.`
      : `Beberapa produk yang sering dipilih oleh tim sales seperti Anda.`,
  );
  fallback.forEach((p) => {
    lines.push(`• ${p.name} — ${p.description}`);
  });
  if (seg) {
    lines.push(
      `Alasan utama: ${seg.talkingPoints.slice(0, 2).join(" · ")}.`,
    );
  }
  lines.push("Ingin saya kirimkan ringkasan produk lewat email atau WhatsApp?");

  const sources = fallback.map((p) => p.name);
  if (seg) sources.push(`Segmen ${seg.label}`);
  return { body: lines.join("\n\n"), sources: sources.slice(0, 3) };
}

function composeSegmentStrategy(
  segment: KbSegment | null,
  kb: KnowledgeBase,
): { body: string; sources: string[] } {
  const seg = segment ?? kb.segments[0];
  if (!seg) {
    return {
      body:
        "Basis Pengetahuan belum berisi segmen target. Tambahkan minimal satu segmen agar saya bisa menyesuaikan strategi.",
      sources: [],
    };
  }
  const note =
    kb.marketingStrategy.find((n) => n.segmentId === seg.id) ??
    kb.marketingStrategy.find((n) => n.segmentId == null) ??
    null;
  const product = pickPriorityProduct(seg, kb);

  const lines: string[] = [];
  lines.push(
    `Untuk segmen ${seg.label} (${seg.revenueBand}, ${seg.headcountBand}), strategi yang sedang Anda pakai adalah:`,
  );
  if (note) {
    lines.push(`“${note.title}” — ${note.body}`);
  } else {
    lines.push(
      "Belum ada catatan strategi khusus segmen ini. Tambahkan di tab Strategi Marketing untuk hasil terbaik.",
    );
  }
  if (product) {
    lines.push(
      `Bawa percakapan ke produk prioritas: ${product.name}. Talking points yang efektif: ${seg.talkingPoints.slice(0, 2).join(" · ")}.`,
    );
  }
  lines.push("Mau saya bantu susun draft pesan pembuka untuk segmen ini?");

  const sources: string[] = [`Segmen ${seg.label}`];
  if (note) sources.push(note.title);
  if (product) sources.push(product.name);
  return { body: lines.join("\n\n"), sources: sources.slice(0, 3) };
}

function composeRetention(
  segment: KbSegment | null,
  kb: KnowledgeBase,
): { body: string; sources: string[] } {
  const active = kb.retentionFlows.filter((f) => f.active);
  const scoped = segment
    ? active.find(
        (f) => f.segmentIds.length === 0 || f.segmentIds.includes(segment.id),
      )
    : null;
  const flow = scoped ?? active[0] ?? kb.retentionFlows[0];
  if (!flow) {
    return {
      body:
        "Belum ada alur retensi di Basis Pengetahuan. Tambahkan minimal satu alur (repeat order, after-sales, atau loyalty) di Pengaturan.",
      sources: [],
    };
  }

  const linkedProduct = flow.productIds[0]
    ? kb.products.find((p) => p.id === flow.productIds[0])
    : null;
  const lines: string[] = [];
  lines.push(
    `Alur retensi yang paling relevan saat ini adalah "${flow.name}".`,
  );
  lines.push(`Pemicu: ${flow.trigger}.`);
  lines.push(
    `Aksi AI: ${flow.action}${flow.delayDays ? ` (jeda ${flow.delayDays} hari setelah pemicu)` : ""}.`,
  );
  if (linkedProduct) {
    lines.push(
      `Alur ini terhubung dengan produk ${linkedProduct.name}, jadi pastikan tim CS punya akses ke riwayat penggunaan pelanggan.`,
    );
  }
  lines.push("Mau saya aktifkan / nonaktifkan alur ini, atau buatkan yang baru?");

  const sources: string[] = [flow.name];
  if (linkedProduct) sources.push(linkedProduct.name);
  if (segment) sources.push(`Segmen ${segment.label}`);
  return { body: lines.join("\n\n"), sources: sources.slice(0, 3) };
}

function composeUpsell(
  segment: KbSegment | null,
  kb: KnowledgeBase,
): { body: string; sources: string[] } {
  const seg = segment ?? kb.segments[0];
  const fromProduct = pickPriorityProduct(seg, kb);
  if (!fromProduct) {
    return {
      body:
        "Belum ada produk aktif di Basis Pengetahuan untuk dijadikan basis upsell.",
      sources: [],
    };
  }
  const rule = kb.upsellMap.find((u) => u.fromProductId === fromProduct.id);
  if (!rule) {
    return {
      body: `Belum ada aturan upsell dari ${fromProduct.name} di Basis Pengetahuan. Tambahkan di tab Upsell agar AI bisa menawarkannya otomatis.`,
      sources: [fromProduct.name],
    };
  }
  const targets = rule.toProductIds
    .map((id) => kb.products.find((p) => p.id === id))
    .filter((p): p is KbProduct => Boolean(p));

  const lines: string[] = [];
  lines.push(
    `Pelanggan ${fromProduct.name}${seg ? ` dari segmen ${seg.label}` : ""} ideal di-upsell ke ${targets.map((t) => t.name).join(" atau ")}.`,
  );
  lines.push(`Alasan: ${rule.rationale}`);
  if (targets[0]) {
    const tier = kb.pricing.find((t) => t.productId === targets[0].id);
    if (tier) {
      lines.push(
        `Tier yang disarankan: ${tier.tierName} di ${formatIDR(tier.priceIDR)}${billingSuffix(tier.billing)}.`,
      );
    }
  }
  lines.push(
    "Mau saya susun draft pesan upsell yang bisa langsung dikirim via WhatsApp?",
  );

  const sources: string[] = [fromProduct.name];
  if (targets[0]) sources.push(targets[0].name);
  sources.push("Aturan upsell");
  return { body: lines.join("\n\n"), sources: sources.slice(0, 3) };
}

function composeGeneral(
  segment: KbSegment | null,
  kb: KnowledgeBase,
): { body: string; sources: string[] } {
  const seg = segment ?? kb.segments[0];
  const products = kb.products.filter((p) => p.active).slice(0, 2);
  const note =
    (seg && kb.marketingStrategy.find((n) => n.segmentId === seg.id)) ??
    kb.marketingStrategy.find((n) => n.segmentId == null) ??
    kb.marketingStrategy[0];

  const lines: string[] = [];
  lines.push(
    `Saya asisten sales Anda yang sudah belajar dari Basis Pengetahuan ${kb.clientName}.`,
  );
  if (products.length) {
    lines.push(
      `Saya bisa bantu menjelaskan produk seperti ${products.map((p) => p.name).join(" dan ")}, menyusun cadence, memetakan upsell, atau menjawab pertanyaan harga.`,
    );
  }
  if (note) {
    lines.push(
      `Strategi yang sedang kita jalankan: "${note.title}" — ${note.body}`,
    );
  }
  lines.push(
    "Coba tanyakan misalnya: 'berapa harga paket untuk UMKM?', 'siapa lead terbaik minggu ini?', atau 'bagaimana retensi pelanggan Enterprise?'",
  );

  const sources: string[] = [];
  if (products[0]) sources.push(products[0].name);
  if (products[1]) sources.push(products[1].name);
  if (note) sources.push(note.title);
  return { body: lines.join("\n\n"), sources: sources.slice(0, 3) };
}

// ── Public entrypoint ───────────────────────────────────────────────────────

/**
 * Compose a KB-grounded mock LLM reply for the global AI assistant.
 *
 * Pure function — safe to call from React components. No side effects.
 */
export function composeKbReply(
  prompt: string,
  kb: KnowledgeBase,
): ComposedKbReply {
  // Empty-KB fallback per Gap B spec.
  const isEmpty =
    kb.products.length === 0 &&
    kb.segments.length === 0 &&
    kb.marketingStrategy.length === 0;
  if (isEmpty) {
    return {
      body:
        "Knowledge Base masih kosong — silakan tambahkan produk/segmen di Pengaturan agar saya bisa memberi jawaban yang akurat.",
      sources: [],
      segmentHit: null,
      intent: "general",
    };
  }

  const intent = classify(prompt);
  const segment = detectSegment(prompt, kb) ?? kb.segments[0] ?? null;

  let result: { body: string; sources: string[] };
  switch (intent) {
    case "pricing":
      result = composePricing(segment, kb);
      break;
    case "product-fit":
      result = composeProductFit(segment, kb);
      break;
    case "segment-strategy":
      result = composeSegmentStrategy(segment, kb);
      break;
    case "retention":
      result = composeRetention(segment, kb);
      break;
    case "upsell":
      result = composeUpsell(segment, kb);
      break;
    case "general":
    default:
      result = composeGeneral(segment, kb);
      break;
  }

  return {
    body: result.body,
    sources: result.sources.slice(0, 3),
    segmentHit: segment?.label ?? null,
    intent,
  };
}
