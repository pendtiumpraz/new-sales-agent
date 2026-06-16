// Retention & After-Sales (Wave 2D) — mock flows, candidates, and KPI numbers.
// Reads contacts/deals read-only from "@/lib/api-mock/data". We never mutate
// shared mock data here.

import { contacts as seedContacts } from "@/lib/api-mock/data";
import type {
  RetentionAudienceFilter,
  RetentionCandidate,
  RetentionFlow,
  RetentionKpi,
  RetentionStep,
} from "@/lib/types/retention";

// Fixed "today" for the demo so derived day-counts stay stable across reloads.
const TODAY = Date.parse("2026-05-29T00:00:00+07:00");

// ---- Flows ----------------------------------------------------------------

export const seedFlows: RetentionFlow[] = [
  {
    id: "rf_repeat_30d",
    name: "Repeat Order 30 Hari",
    type: "repeat-order",
    status: "aktif",
    description:
      "Otomatis menghubungi pelanggan 30 hari setelah pembelian terakhir dengan penawaran isi ulang.",
    kbFlowId: "kb_rf_001",
    enrolled: 142,
    conversionRate: 28,
    segmentTarget: "UMKM",
    triggerCondition: "30 hari sejak pembelian terakhir",
    createdAt: "2026-03-12T08:00:00+07:00",
    updatedAt: "2026-05-20T10:24:00+07:00",
    steps: [
      {
        id: "rf_repeat_30d_s1",
        channel: "whatsapp",
        delayDays: 0,
        content:
          "Halo {{nama}} 👋 Sudah hampir sebulan sejak pembelian terakhir di {{perusahaan}}. Stok {{produk}} biasanya habis di sekitar waktu ini — mau saya bantu pesan ulang dengan harga pelanggan setia?",
      },
      {
        id: "rf_repeat_30d_s2",
        channel: "whatsapp",
        delayDays: 3,
        content:
          "{{nama}}, penawaran isi ulang kami berlaku 3 hari lagi. Diskon 10% untuk pemesanan via WhatsApp. Balas YA untuk lanjut, atau TANYA bila butuh rekomendasi.",
      },
      {
        id: "rf_repeat_30d_s3",
        channel: "email",
        delayDays: 5,
        subject: "Kami siapkan harga khusus untuk {{perusahaan}}",
        content:
          "Halo {{nama}},\n\nTerima kasih sudah menjadi pelanggan {{perusahaan}}. Berikut katalog pemesanan ulang dengan harga pelanggan setia. Balas email ini bila perlu bantuan menyiapkan PO.\n\nSalam,\nTim After-Sales",
      },
    ],
  },
  {
    id: "rf_repeat_90d",
    name: "Repeat Order 90 Hari (B2B)",
    type: "repeat-order",
    status: "aktif",
    description:
      "Siklus pembelian korporat — pendekatan konsultatif untuk pelanggan B2B menjelang kuartal baru.",
    kbFlowId: "kb_rf_002",
    enrolled: 38,
    conversionRate: 42,
    segmentTarget: "Korporat",
    triggerCondition: "90 hari sejak PO terakhir + segmen Korporat",
    createdAt: "2026-02-04T08:00:00+07:00",
    updatedAt: "2026-05-12T14:00:00+07:00",
    steps: [
      {
        id: "rf_repeat_90d_s1",
        channel: "email",
        delayDays: 0,
        subject: "Rencana pemesanan kuartal berikutnya — {{perusahaan}}",
        content:
          "Halo {{nama}},\n\nMendekati siklus pemesanan kuartalan Anda. Apakah kami bisa bantu menyiapkan estimasi kebutuhan {{produk}} berdasarkan pola pemakaian 3 bulan terakhir?\n\nSalam,\nAccount Manager",
      },
      {
        id: "rf_repeat_90d_s2",
        channel: "whatsapp",
        delayDays: 5,
        content:
          "Halo {{nama}}, lanjutan dari email saya. Boleh dijadwalkan call 20 menit minggu ini untuk membahas kebutuhan kuartal berikutnya?",
      },
    ],
  },
  {
    id: "rf_upsell_growth",
    name: "Upsell ke Paket Growth",
    type: "upsell",
    status: "aktif",
    description:
      "Tawarkan paket Growth ke pelanggan Starter yang sudah aktif > 60 hari dan menunjukkan signal pertumbuhan tim.",
    kbFlowId: "kb_rf_003",
    enrolled: 21,
    conversionRate: 19,
    segmentTarget: "Menengah",
    triggerCondition: "Pengguna Starter aktif > 60 hari + signal upgrade",
    createdAt: "2026-03-29T08:00:00+07:00",
    updatedAt: "2026-05-18T11:00:00+07:00",
    steps: [
      {
        id: "rf_upsell_growth_s1",
        channel: "whatsapp",
        delayDays: 0,
        content:
          "Halo {{nama}}! Lihat tim {{perusahaan}} sudah tumbuh sejak pakai Paket Starter. Banyak tim seukuran Anda upgrade ke Growth untuk cadence outbound + skor AI. Mau saya jelaskan benefitnya 10 menit?",
      },
      {
        id: "rf_upsell_growth_s2",
        channel: "email",
        delayDays: 4,
        subject: "Studi kasus: upgrade Starter → Growth",
        content:
          "Halo {{nama}},\n\nTerlampir 2 studi kasus tim sejenis yang upgrade ke Growth dan menutup 2× lebih banyak deal. Bila tertarik, saya bisa siapkan trial 14 hari penuh untuk modul tambahan.\n\nSalam,\nTim Sukses Pelanggan",
      },
      {
        id: "rf_upsell_growth_s3",
        channel: "whatsapp",
        delayDays: 7,
        content:
          "{{nama}}, tawaran trial Growth 14 hari masih berlaku 48 jam. Balas YA untuk diaktifkan langsung.",
      },
    ],
  },
  {
    id: "rf_after_sales_thanks",
    name: "Terima Kasih & Onboarding",
    type: "after-sales",
    status: "aktif",
    description:
      "Pesan terima kasih + tutorial cepat 24 jam setelah transaksi selesai. Mendorong adopsi awal.",
    kbFlowId: "kb_rf_004",
    enrolled: 86,
    conversionRate: 73,
    segmentTarget: "Semua",
    triggerCondition: "Transaksi berstatus selesai",
    createdAt: "2026-01-18T08:00:00+07:00",
    updatedAt: "2026-05-22T09:15:00+07:00",
    steps: [
      {
        id: "rf_after_sales_thanks_s1",
        channel: "whatsapp",
        delayDays: 0,
        content:
          "Halo {{nama}}, terima kasih banyak atas pembelian {{produk}}! Pesanan Anda sudah kami catat. Bila butuh bantuan setup awal, balas pesan ini kapan saja 🙏",
      },
      {
        id: "rf_after_sales_thanks_s2",
        channel: "email",
        delayDays: 1,
        subject: "Panduan cepat memulai — {{produk}}",
        content:
          "Halo {{nama}},\n\nBerikut panduan 3 langkah agar tim {{perusahaan}} bisa mulai menggunakan {{produk}} hari ini juga. Klik tautan di bawah untuk video tutorial 4 menit.\n\nSalam hangat,\nTim Customer Success",
      },
      {
        id: "rf_after_sales_thanks_s3",
        channel: "sms",
        delayDays: 3,
        content:
          "{{nama}}, pengingat: jadwalkan onboarding call gratis 30 menit. Balas JADWAL untuk dihubungi tim kami.",
      },
    ],
  },
  {
    id: "rf_after_sales_nps",
    name: "Survei NPS 14 Hari",
    type: "after-sales",
    status: "jeda",
    description:
      "Survei kepuasan singkat 14 hari pasca-pembelian. Hasil otomatis masuk insight market mapping.",
    kbFlowId: "kb_rf_005",
    enrolled: 64,
    conversionRate: 51,
    segmentTarget: "Semua",
    triggerCondition: "14 hari setelah transaksi selesai",
    createdAt: "2026-02-22T08:00:00+07:00",
    updatedAt: "2026-05-08T16:30:00+07:00",
    steps: [
      {
        id: "rf_after_sales_nps_s1",
        channel: "whatsapp",
        delayDays: 0,
        content:
          "Halo {{nama}}, sudah 2 minggu sejak pembelian. Dari skala 0–10, seberapa besar kemungkinan Anda merekomendasikan {{produk}} ke kolega? Cukup balas angkanya 🙏",
      },
      {
        id: "rf_after_sales_nps_s2",
        channel: "whatsapp",
        delayDays: 2,
        content:
          "Terima kasih {{nama}}! Boleh kami minta satu kalimat alasan? Masukan Anda kami pakai untuk meningkatkan layanan.",
      },
    ],
  },
];

// ---- KPI ------------------------------------------------------------------

export const seedKpi: RetentionKpi = {
  activeCustomers: 351,
  activeCustomersTrend: 8.4,
  repeatOrdersThisMonth: 62,
  repeatOrderValueIDR: 1_245_000_000,
  upsellRate: 18,
  upsellRateDelta: 3,
  averageNps: 64,
};

// ---- Candidates -----------------------------------------------------------

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const FLOW_POOL = [
  { id: "rf_repeat_30d", name: "Repeat Order 30 Hari" },
  { id: "rf_repeat_90d", name: "Repeat Order 90 Hari (B2B)" },
  { id: "rf_upsell_growth", name: "Upsell ke Paket Growth" },
  { id: "rf_after_sales_thanks", name: "Terima Kasih & Onboarding" },
];

const AI_NOTES = [
  "Frekuensi pembelian historis menunjukkan siklus ~30 hari — momentum tepat.",
  "Segmen Korporat dengan PO rutin per kuartal — kandidat kuat repeat order.",
  "Sudah pakai Paket Starter > 60 hari, signal tim berkembang — peluang upsell.",
  "Baru transaksi, perlu onboarding cepat agar adopsi optimal.",
  "Skor NPS sebelumnya tinggi (9/10) — siap diajak repeat dan referral.",
  "Belum interaksi 35 hari — perlu pendekatan ulang halus via WhatsApp.",
  "Volume pembelian naik 20% kuartal lalu — kandidat upgrade paket.",
  "Pengguna setia 6+ bulan — cocok untuk cross-sell modul WhatsApp API.",
];

/** Build deterministic candidates from shared contact mock data (read-only). */
export function buildCandidates(): RetentionCandidate[] {
  // Pick a stable subset of contacts to act as "post-purchase" customers.
  const pool = seedContacts.slice(0, 14);
  return pool.slice(0, 8).map((c, i) => {
    const h = hash(c.id);
    // 8..72 days since purchase, deterministic
    const daysSincePurchase = 8 + ((h >> 2) % 65);
    const lastPurchase = new Date(
      TODAY - daysSincePurchase * 86_400_000,
    ).toISOString();
    const flow = FLOW_POOL[i % FLOW_POOL.length];
    const aiNote = AI_NOTES[(h >> 5) % AI_NOTES.length];

    return {
      contactId: c.id,
      contactName: c.name,
      company: c.company,
      lastPurchase,
      daysSincePurchase,
      recommendedFlowId: flow.id,
      recommendedFlowName: flow.name,
      aiNote,
    };
  });
}

export const seedCandidates: RetentionCandidate[] = buildCandidates();

// ---- Helpers --------------------------------------------------------------

export function flowById(
  id: string,
  flows: RetentionFlow[] = seedFlows,
): RetentionFlow | undefined {
  return flows.find((f) => f.id === id);
}

/** Sample AI-rendered message preview for the "simulate" panel on flow detail. */
export function sampleAiMessage(flow: RetentionFlow, step?: RetentionStep): string {
  const target = step ?? flow.steps[0];
  if (!target) return "Belum ada langkah untuk disimulasikan.";
  // Static substitution — demo data, no real LLM call.
  const body = target.content
    .replaceAll("{{nama}}", "Ibu Maharani")
    .replaceAll("{{perusahaan}}", "PT Sinar Mas")
    .replaceAll("{{produk}}", "Paket Starter");
  return body;
}

/**
 * Real audience estimate for a flow's filter, computed from the candidate
 * pool (read-only). Only the day-since-interaction range has backing data on
 * candidates, so that's what narrows the count; segment/tags are preview-only
 * (no per-candidate segment/tag field in the demo dataset).
 */
export function estimateAudience(
  candidates: RetentionCandidate[],
  filter?: RetentionAudienceFilter,
): number {
  const min = filter?.minDaysSinceInteraction ?? 0;
  const max = filter?.maxDaysSinceInteraction ?? Infinity;
  return candidates.filter(
    (c) => c.daysSincePurchase >= min && c.daysSincePurchase <= max,
  ).length;
}

/** Counters used by the dashboard header. */
export function flowCounters(flows: RetentionFlow[] = seedFlows) {
  return {
    total: flows.length,
    active: flows.filter((f) => f.status === "aktif").length,
    paused: flows.filter((f) => f.status === "jeda").length,
    repeatOrder: flows.filter((f) => f.type === "repeat-order").length,
    upsell: flows.filter((f) => f.type === "upsell").length,
    afterSales: flows.filter((f) => f.type === "after-sales").length,
  };
}

// Re-export RetentionStep so consumers don't need a second import.
export type { RetentionStep };
