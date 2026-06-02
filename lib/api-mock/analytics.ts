// Mock analytics data for the /reports module (Wave 2E).
// Seeded deterministically — no Math.random at module scope so the dashboard
// renders identically across reloads. All figures are Indonesian-realistic
// (IDR ranges, PT-prefixed companies, BI sales rep names).

import type {
  AiErrorReport,
  AiErrorTrendPoint,
  PipelineVerification,
  SalesReport,
} from "@/lib/types/analytics";

// ---- AI error rate (§7.1) ----------------------------------------------------

/** Build a 30-day trend with a gentle downward slope (improving accuracy). */
function buildErrorTrend(): AiErrorTrendPoint[] {
  const points: AiErrorTrendPoint[] = [];
  // Anchor end-date to the demo's "today" (1 Jun 2026) so dates feel current.
  const end = new Date("2026-06-01T00:00:00+07:00").getTime();
  // Hand-tuned sequence — earlier days higher, recent days lower, with noise.
  const noise = [
    0.6, 0.4, 0.7, 0.3, 0.5, 0.2, 0.6, 0.4, 0.3, 0.5, 0.6, 0.2, 0.4, 0.3, 0.5,
    0.4, 0.3, 0.5, 0.2, 0.6, 0.3, 0.4, 0.2, 0.5, 0.3, 0.4, 0.2, 0.3, 0.4, 0.2,
  ];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(end - i * 864e5);
    // Slope: 6.8 → 3.6 over the window
    const base = 3.6 + (i / 29) * 3.2;
    const rate = Math.max(1.5, +(base + (noise[29 - i] ?? 0.3) - 0.3).toFixed(2));
    points.push({ date: d.toISOString().slice(0, 10), rate });
  }
  return points;
}

export const aiErrorReport: AiErrorReport = {
  totalResponses: 12_840,
  errorCount: 487,
  errorRate: 3.79,
  errorRateDeltaPctPoints: -1.4,
  trend30d: buildErrorTrend(),
  byType: [
    { type: "Salah informasi produk", count: 196, rate: 1.53 },
    { type: "Harga tidak akurat", count: 142, rate: 1.11 },
    { type: "Salah identifikasi maksud", count: 98, rate: 0.76 },
    { type: "Lainnya", count: 51, rate: 0.4 },
  ],
  recentFlagged: [
    {
      id: "flag-001",
      conversationId: "conv-1024",
      snippet:
        "“Paket Premium kami hanya Rp 1,5 juta per bulan untuk fitur AI dan WhatsApp Business...”",
      reason: "Harga tidak akurat — paket Premium aktual Rp 2,2 juta/bulan",
      flaggedAt: "2026-05-31T14:22:00+07:00",
    },
    {
      id: "flag-002",
      conversationId: "conv-1019",
      snippet:
        "“Ya Bu, fitur multi-channel sudah termasuk integrasi Tokopedia di paket Starter.”",
      reason: "Salah informasi produk — Tokopedia hanya di Premium",
      flaggedAt: "2026-05-31T11:08:00+07:00",
    },
    {
      id: "flag-003",
      conversationId: "conv-1011",
      snippet:
        "“Saya bisa bantu jadwalkan demo untuk minggu depan, Pak.”",
      reason: "Salah identifikasi maksud — pelanggan menanyakan invoice",
      flaggedAt: "2026-05-30T16:45:00+07:00",
    },
    {
      id: "flag-004",
      conversationId: "conv-1007",
      snippet:
        "“Diskon 20% berlaku untuk semua paket hingga akhir bulan ini.”",
      reason: "Harga tidak akurat — promo hanya untuk paket Enterprise",
      flaggedAt: "2026-05-30T09:30:00+07:00",
    },
    {
      id: "flag-005",
      conversationId: "conv-0998",
      snippet:
        "“Kami juga menyediakan modul HR di aplikasi ini, Bu.”",
      reason: "Salah informasi produk — modul HR tidak tersedia",
      flaggedAt: "2026-05-29T13:12:00+07:00",
    },
  ],
};

// ---- End-to-end sales report (§7.2) -----------------------------------------

export const salesReport: SalesReport = {
  revenueMtdIDR: 2_840_000_000,
  dealsClosedMtd: 18,
  conversionRate: 22.4,
  avgCycleDays: 28,
  byChannel: [
    { channel: "WhatsApp", prospect: 124, qualified: 78, offer: 42, won: 19 },
    { channel: "Email", prospect: 92, qualified: 51, offer: 28, won: 11 },
    { channel: "Instagram", prospect: 68, qualified: 34, offer: 18, won: 7 },
    { channel: "Tokopedia", prospect: 56, qualified: 28, offer: 14, won: 6 },
  ],
  topCadences: [
    { name: "Welcome WA + Email — BUMN", replyRate: 38.4, enrolled: 142 },
    { name: "Re-engage Q2 — UKM Retail", replyRate: 32.1, enrolled: 218 },
    { name: "Demo follow-up 3-step", replyRate: 29.7, enrolled: 96 },
    { name: "Tokopedia abandoned cart", replyRate: 26.5, enrolled: 184 },
    { name: "Enterprise nurture 7-day", replyRate: 24.8, enrolled: 64 },
  ],
  topContent: [
    { title: "Studi kasus: PT Astra +42% closing", type: "Blog", reach: 12_840 },
    { title: "WA broadcast — Promo Lebaran 2026", type: "WhatsApp", reach: 9_620 },
    { title: "Email newsletter: Tren AI Sales Q2", type: "Email", reach: 7_410 },
    { title: "Instagram reel: Demo produk 30 detik", type: "Instagram", reach: 6_280 },
    { title: "Panduan onboarding 5 menit", type: "Blog", reach: 4_960 },
  ],
  leaderboard: [
    { name: "Rina Permata", deals: 7, valueIDR: 1_120_000_000 },
    { name: "Andi Hidayat", deals: 5, valueIDR: 840_000_000 },
    { name: "Maya Kusuma", deals: 4, valueIDR: 520_000_000 },
    { name: "Budi Santoso", deals: 3, valueIDR: 360_000_000 },
    { name: "Hendra Wijaya", deals: 2, valueIDR: 280_000_000 },
    { name: "Nurul Aini", deals: 2, valueIDR: 195_000_000 },
  ],
};

// ---- Pipeline data verification (§7.3) --------------------------------------

export const pipelineVerification: PipelineVerification = {
  totalDeals: 248,
  cleanDeals: 213,
  cleanRate: 85.9,
  issues: [
    { id: "issue-value", type: "Deals tanpa nilai", count: 14, severity: "tinggi" },
    { id: "issue-contact", type: "Deals tanpa kontak", count: 9, severity: "tinggi" },
    {
      id: "issue-stale",
      type: "Deals stagnan > 30 hari",
      count: 18,
      severity: "sedang",
    },
    { id: "issue-duplicate", type: "Deals duplikat", count: 6, severity: "rendah" },
  ],
};
