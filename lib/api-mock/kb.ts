// Knowledge Base mock data (Wave 2B) — owned by KB agent.
// Indonesian SaaS sales context. Single-tenant for the demo.

import type {
  KbPricingTier,
  KbProduct,
  KbRetentionFlow,
  KbSegment,
  KbSource,
  KbStrategyNote,
  KbUpsellRule,
  KbPriorityMapping,
  KnowledgeBase,
} from "@/lib/types/kb";

// Stable "now" for deterministic seeding (the demo loads fresh each session).
const NOW = Date.now();
const daysAgo = (d: number) =>
  new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();
const hoursAgo = (h: number) =>
  new Date(NOW - h * 60 * 60 * 1000).toISOString();

// ── Products ───────────────────────────────────────────────────────────────
export const seedProducts: KbProduct[] = [
  {
    id: "prod_starter",
    name: "Paket Starter",
    description:
      "CRM ringkas untuk tim sales kecil. WhatsApp + Email + skoring lead AI dasar.",
    sku: "AGT-STR-01",
    category: "Inti",
    active: true,
    accent: "#FB5E3B",
  },
  {
    id: "prod_growth",
    name: "Paket Growth",
    description:
      "Cadence multi-channel, dashboard tim, dan AI co-pilot untuk reply otomatis.",
    sku: "AGT-GRW-01",
    category: "Inti",
    active: true,
    accent: "#F59E0B",
  },
  {
    id: "prod_enterprise",
    name: "Paket Enterprise",
    description:
      "Advanced RAG per-klien, audit UU PDP siap-regulator, SSO, dan SLA prioritas.",
    sku: "AGT-ENT-01",
    category: "Inti",
    active: true,
    accent: "#14B8A6",
  },
  {
    id: "prod_wa_addon",
    name: "Add-on WhatsApp Business",
    description:
      "Kuota tambahan pesan WhatsApp Business API + template multi-bahasa.",
    sku: "AGT-WA-ADD",
    category: "Add-on",
    active: true,
    accent: "#8B5CF6",
  },
];

// ── Pricing (IDR, monthly unless noted) ────────────────────────────────────
export const seedPricing: KbPricingTier[] = [
  {
    id: "price_starter_solo",
    productId: "prod_starter",
    tierName: "Solo",
    priceIDR: 199000,
    billing: "bulanan",
    features: [
      "1 pengguna",
      "1.000 kontak",
      "WhatsApp & Email inbox",
      "Skoring lead AI dasar",
    ],
    minCommitmentMonths: 1,
  },
  {
    id: "price_starter_tim",
    productId: "prod_starter",
    tierName: "Tim",
    priceIDR: 399000,
    billing: "bulanan",
    features: [
      "5 pengguna",
      "5.000 kontak",
      "Inbox bersama",
      "Laporan mingguan otomatis",
    ],
    minCommitmentMonths: 1,
  },
  {
    id: "price_growth_std",
    productId: "prod_growth",
    tierName: "Standar",
    priceIDR: 449000,
    billing: "bulanan",
    features: [
      "Per pengguna / bulan",
      "Cadence multi-channel",
      "AI Reply Assist",
      "Integrasi Tokopedia & Shopee",
    ],
    minCommitmentMonths: 3,
  },
  {
    id: "price_growth_plus",
    productId: "prod_growth",
    tierName: "Plus",
    priceIDR: 749000,
    billing: "bulanan",
    features: [
      "Per pengguna / bulan",
      "Otomatisasi retensi",
      "Pipeline AI prioritisasi",
      "Dukungan WhatsApp 8x5",
    ],
    minCommitmentMonths: 3,
  },
  {
    id: "price_enterprise_annual",
    productId: "prod_enterprise",
    tierName: "Tahunan",
    priceIDR: 28800000,
    billing: "tahunan",
    features: [
      "Mulai dari 20 pengguna",
      "Advanced RAG basis pengetahuan",
      "SSO + SAML, audit UU PDP",
      "SLA prioritas 99,9%",
      "DPO terkelola",
    ],
    minCommitmentMonths: 12,
  },
  {
    id: "price_wa_addon",
    productId: "prod_wa_addon",
    tierName: "10rb pesan",
    priceIDR: 850000,
    billing: "satu-kali",
    features: [
      "10.000 percakapan",
      "Template multi-bahasa",
      "Verifikasi nomor business",
    ],
  },
];

// ── Segments ───────────────────────────────────────────────────────────────
export const seedSegments: KbSegment[] = [
  {
    id: "seg_umkm",
    label: "UMKM",
    description:
      "Usaha mikro & kecil — pemilik aktif terlibat. Sensitif harga, butuh setup cepat.",
    revenueBand: "< Rp 5 M/tahun",
    headcountBand: "1–10 karyawan",
    talkingPoints: [
      "Setup di bawah 10 menit",
      "Hemat 6 jam/minggu balas WhatsApp manual",
      "Tanpa biaya implementasi",
    ],
  },
  {
    id: "seg_menengah",
    label: "Menengah",
    description:
      "Tim sales 5–25 orang. Sudah punya proses, butuh konsolidasi channel & laporan.",
    revenueBand: "Rp 5–100 M/tahun",
    headcountBand: "11–200 karyawan",
    talkingPoints: [
      "Cadence lintas channel meningkatkan reply rate 3×",
      "Laporan otomatis untuk manajer",
      "Integrasi Tokopedia & Shopee siap pakai",
    ],
  },
  {
    id: "seg_korporat",
    label: "Korporat",
    description:
      "Perusahaan menengah-besar dengan tim sales nasional & kebutuhan kepatuhan UU PDP.",
    revenueBand: "> Rp 100 M/tahun",
    headcountBand: "200+ karyawan",
    talkingPoints: [
      "Audit UU PDP No. 27/2022 siap-regulator",
      "Advanced RAG dilatih dari katalog produk Anda",
      "SSO, SAML, residensi data AWS Jakarta",
    ],
  },
];

// ── Priority products per segment ──────────────────────────────────────────
export const seedPriorityProducts: KbPriorityMapping[] = [
  { segmentId: "seg_umkm", productIds: ["prod_starter", "prod_wa_addon"] },
  { segmentId: "seg_menengah", productIds: ["prod_growth", "prod_wa_addon"] },
  { segmentId: "seg_korporat", productIds: ["prod_enterprise", "prod_growth"] },
];

// ── Marketing strategy notes ───────────────────────────────────────────────
export const seedStrategy: KbStrategyNote[] = [
  {
    id: "strat_umkm_speed",
    title: "Buka dengan janji setup cepat",
    body: "Untuk UMKM, sebut 'siap pakai dalam 10 menit' di pesan pertama. Hindari istilah teknis seperti API / SSO.",
    segmentId: "seg_umkm",
  },
  {
    id: "strat_menengah_roi",
    title: "Pakai metrik ROI yang konkret",
    body: "Sebut '3× reply rate' dan 'hemat 12 jam/minggu per sales'. Tawarkan demo 15 menit + studi kasus PT sejenis.",
    segmentId: "seg_menengah",
  },
  {
    id: "strat_korporat_compliance",
    title: "Tonjolkan kepatuhan UU PDP",
    body: "Korporat memprioritaskan audit & residensi data. Buka percakapan dengan skor PDPA 94/100 dan DPO terkelola.",
    segmentId: "seg_korporat",
  },
  {
    id: "strat_all_handoff",
    title: "Handoff ke manusia bila sentimen negatif",
    body: "AI harus eskalasi ke sales rep saat sentimen turun, ada keberatan harga keras, atau topik di luar katalog produk.",
    segmentId: null,
  },
];

// ── Upsell map ─────────────────────────────────────────────────────────────
export const seedUpsell: KbUpsellRule[] = [
  {
    id: "ups_starter_growth",
    fromProductId: "prod_starter",
    toProductIds: ["prod_growth", "prod_wa_addon"],
    rationale:
      "Pelanggan Starter sering kehabisan kuota pesan setelah 2 bulan. Tawarkan Growth + WA Add-on.",
  },
  {
    id: "ups_growth_enterprise",
    fromProductId: "prod_growth",
    toProductIds: ["prod_enterprise"],
    rationale:
      "Tim Growth >15 pengguna mulai butuh SSO + audit UU PDP. Pindahkan ke Enterprise tahunan.",
  },
  {
    id: "ups_enterprise_addon",
    fromProductId: "prod_enterprise",
    toProductIds: ["prod_wa_addon"],
    rationale:
      "Akun Enterprise dengan >50.000 percakapan/bulan butuh top-up WhatsApp Business.",
  },
];

// ── Retention flows ────────────────────────────────────────────────────────
export const seedRetention: KbRetentionFlow[] = [
  {
    id: "ret_repeat_starter",
    name: "Repeat order — Starter ke Growth",
    type: "repeat-order",
    trigger: "Pelanggan Starter aktif 60 hari & >80% kuota terpakai",
    action:
      "Kirim WhatsApp menawarkan migrasi Growth dengan diskon 1 bulan + jadwalkan demo singkat.",
    delayDays: 0,
    productIds: ["prod_starter"],
    segmentIds: ["seg_umkm"],
    active: true,
  },
  {
    id: "ret_after_sales_check",
    name: "Check-in pasca penjualan H+14",
    type: "after-sales",
    trigger: "14 hari setelah deal ditandai Tutup",
    action:
      "Email survei NPS singkat + ajakan pakai fitur cadence. Jika NPS ≤ 6, eskalasi ke CS.",
    delayDays: 14,
    productIds: [],
    segmentIds: [],
    active: true,
  },
  {
    id: "ret_loyalty_qbr",
    name: "Quarterly Business Review — Korporat",
    type: "loyalty",
    trigger: "Pelanggan Enterprise mendekati 90 hari sejak QBR terakhir",
    action:
      "Jadwalkan QBR + sajikan ringkasan dampak (closing rate, jam dihemat, sentimen pelanggan).",
    delayDays: 7,
    productIds: ["prod_enterprise"],
    segmentIds: ["seg_korporat"],
    active: true,
  },
  {
    id: "ret_loyalty_anniversary",
    name: "Apresiasi 1 tahun berlangganan",
    type: "loyalty",
    trigger: "Tepat 365 hari sejak aktivasi paket",
    action:
      "WhatsApp pesan apresiasi + voucher upgrade 10% untuk 30 hari ke depan.",
    delayDays: 0,
    productIds: [],
    segmentIds: [],
    active: false,
  },
];

// ── Sources (Advanced RAG) ─────────────────────────────────────────────────
// Mocked multi-source corpus. AI test panel surfaces these as "Sumber dipakai".
export const seedSources: KbSource[] = [
  {
    id: "src_brosur_growth",
    kind: "pdf",
    title: "Brosur Paket Growth",
    description:
      "Materi penjualan resmi paket Growth — fitur, harga, dan studi kasus PT sejenis.",
    ref: "brosur-growth-v3.pdf",
    segmentScope: ["seg_menengah"],
    chunks: 84,
    lastIndexedAt: daysAgo(2),
    status: "indexed",
    active: true,
  },
  {
    id: "src_faq_onboarding",
    kind: "faq",
    title: "FAQ Onboarding 10 menit",
    description:
      "Pertanyaan paling sering dari pelanggan UMKM saat aktivasi awal.",
    ref: "Tim Customer Success",
    question:
      "Berapa lama setup awal sampai bisa terima pesan WhatsApp pertama?",
    answer:
      "Setup standar di bawah 10 menit. Anda hanya perlu scan QR WhatsApp Business, import kontak (opsional), dan pilih template auto-reply. Tim CS kami stand-by lewat WhatsApp jika butuh bantuan, tanpa biaya implementasi tambahan.",
    segmentScope: ["seg_umkm"],
    chunks: 12,
    lastIndexedAt: hoursAgo(18),
    status: "indexed",
    active: true,
  },
  {
    id: "src_pricing_url",
    kind: "url",
    title: "Halaman harga website",
    description:
      "Sumber kebenaran harga publik. Dirayapi ulang setiap minggu.",
    ref: "https://agenticsales.id/harga",
    segmentScope: [],
    chunks: 36,
    lastIndexedAt: daysAgo(5),
    status: "indexed",
    active: true,
  },
  {
    id: "src_refund_doc",
    kind: "doc",
    title: "Kebijakan Refund & SLA",
    description:
      "Dokumen internal Legal — aturan pengembalian dana, kompensasi SLA, dan eskalasi.",
    ref: "kebijakan-refund-2026.docx",
    segmentScope: [],
    chunks: 28,
    lastIndexedAt: daysAgo(11),
    status: "indexed",
    active: true,
  },
  {
    id: "src_faq_wa_integration",
    kind: "faq",
    title: "FAQ Integrasi WhatsApp Business",
    description:
      "Pertanyaan teknis seputar verifikasi nomor, template, dan kuota pesan.",
    ref: "Tim Integrations",
    question:
      "Apakah saya bisa pakai nomor WhatsApp Business yang sudah ada?",
    answer:
      "Bisa. Selama nomor tersebut belum terhubung ke WhatsApp Business API lain, kami bisa migrasikan dalam 1-2 hari kerja. Verifikasi business profile tetap berlaku, dan riwayat chat 30 hari terakhir bisa dipertahankan untuk pelanggan Growth ke atas.",
    segmentScope: ["seg_umkm", "seg_menengah"],
    chunks: 18,
    lastIndexedAt: daysAgo(1),
    status: "indexed",
    active: true,
  },
  {
    id: "src_whitepaper_pdp",
    kind: "pdf",
    title: "Whitepaper Kepatuhan UU PDP No. 27/2022",
    description:
      "Panduan teknis kepatuhan UU PDP — kontrol akses, residensi data AWS Jakarta, DPO terkelola.",
    ref: "whitepaper-pdp-27-2022.pdf",
    segmentScope: ["seg_korporat"],
    chunks: 168,
    lastIndexedAt: daysAgo(9),
    status: "indexed",
    active: true,
  },
  {
    id: "src_studi_kasus_finance",
    kind: "pdf",
    title: "Studi Kasus — PT Finance Nusantara",
    description:
      "Studi kasus migrasi 250 user dari CRM legacy. Reply rate +280%, NPS +24.",
    ref: "case-study-finance-nusantara.pdf",
    segmentScope: ["seg_korporat", "seg_menengah"],
    chunks: 42,
    lastIndexedAt: hoursAgo(6),
    status: "indexing",
    active: true,
  },
  {
    id: "src_integration_catalog_url",
    kind: "url",
    title: "Katalog integrasi (Tokopedia, Shopee, Xendit)",
    description:
      "Halaman katalog integrasi resmi. Dipakai AI saat prospek menanyakan kompatibilitas.",
    ref: "https://agenticsales.id/integrasi",
    segmentScope: [],
    chunks: 22,
    lastIndexedAt: daysAgo(24),
    status: "stale",
    active: true,
  },
];

// ── Full KB ────────────────────────────────────────────────────────────────
export const seedKnowledgeBase: KnowledgeBase = {
  clientId: "client_agentic_id",
  clientName: "Agentic Sales Indonesia",
  products: seedProducts,
  pricing: seedPricing,
  segments: seedSegments,
  priorityProducts: seedPriorityProducts,
  marketingStrategy: seedStrategy,
  upsellMap: seedUpsell,
  retentionFlows: seedRetention,
  sources: seedSources,
  lastUpdated: new Date().toISOString(),
};
