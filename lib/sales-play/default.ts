// Sensible default Sales Play — mirrors docs/sales-script-humanis.md. Used as
// the starting config for a new workspace until the founder tweaks it.

import type { SalesPlay, SalesStage } from "@/lib/types/sales-play";

const DEFAULT_STAGES: SalesStage[] = [
  { key: "rapport", label: "Rapport", goal: "Bikin cair, jangan langsung jualan.", exitCriteria: "Pelanggan membalas / nyaman." },
  { key: "discovery", label: "Gali kebutuhan", goal: "Temukan pain spesifik lewat pertanyaan pilihan.", exitCriteria: "Pain/kebutuhan utama teridentifikasi." },
  { key: "value", label: "Value (worth of cost)", goal: "Bangun biaya-masalah lalu sampaikan value. Belum harga.", exitCriteria: "Pelanggan mengakui value / tertarik." },
  { key: "objection", label: "Objection / QnA", goal: "Tanya balik, validasi, reframe keberatan.", exitCriteria: "Keberatan utama terjawab." },
  { key: "closing", label: "Closing", goal: "Pakai 1 teknik closing sesuai sinyal; arahkan ke transaksi.", exitCriteria: "Deal / handoff ke manusia." },
];

export function defaultSalesPlay(
  market: SalesPlay["marketType"] = "mix",
  overrides: Partial<SalesPlay> = {},
): SalesPlay {
  return {
    marketType: market,
    stages: DEFAULT_STAGES,
    adab: {
      maxSentencesPerBubble: 2,
      allowFiller: true,
      closeQuestions: true,
      noMarkdown: true,
      emoji: "sparse",
      forbiddenTopics: ["politik", "SARA", "agama sensitif", "judi", "konten dewasa"],
    },
    priceGate: {
      requireNeed: true,
      requireValue: true,
      earlyPriceBridge:
        "Boleh, biar aku kasih angka yang pas — boleh cerita dulu kebutuhan utamanya?",
    },
    worthOfCost: {
      enabled: true,
      costAnchors: [],
    },
    valueLadder: [],
    handoff: {
      onNegotiation: true,
      onComplaint: true,
      onPriceAboveIDR: null,
      keywords: ["komplain", "refund", "bicara orang", "manusia", "nego"],
    },
    closingTechniqueIds: [],
    stageMaterials: [],
    ...overrides,
  };
}
