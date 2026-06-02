// Wave 2C mock data — sentiment, handoff events, and per-product sentiment
// for market mapping. Local to the handoff module; do NOT import via the
// shared mock-data barrel.
import type {
  ConversationSentiment,
  HandoffEvent,
  ProductSentiment,
} from "@/lib/types/handoff";

/** Build a small history sparkline ending at `score`. */
function buildHistory(score: number, bias: number, hours: number[]): {
  timestamp: string;
  score: number;
}[] {
  const now = Date.now();
  return hours.map((h, i) => {
    // Walk from a starting point toward the final score with small noise.
    const t = i / (hours.length - 1);
    const drift = bias * (1 - t);
    const noise = ((i * 37) % 11) - 5;
    const s = Math.round(score - drift + noise);
    return {
      timestamp: new Date(now - h * 3600_000).toISOString(),
      score: Math.max(-100, Math.min(100, s)),
    };
  });
}

const HOURS = [12, 9, 6, 4, 2, 1, 0.25];

/**
 * Per-conversation sentiment, keyed by the conversation IDs used in
 * `lib/mock-data/conversations.json`. Conversations NOT listed here are
 * treated as neutral by the store helper (score = 0, stable trend).
 */
export const conversationSentiments: ConversationSentiment[] = [
  // WhatsApp — the primary handoff demo channel.
  {
    conversationId: "cv_0015", // Reza Maharani — Koperasi Makmur Mitra
    score: -42,
    trend: "down",
    history: buildHistory(-42, -30, HOURS),
    lastAiResponseAt: new Date(Date.now() - 22 * 60_000).toISOString(),
    topics: ["keluhan serius", "refund"],
    productMentions: ["Paket Growth"],
  },
  {
    conversationId: "cv_0008", // Dian Anggraini — CV Mas Prima
    score: 28,
    trend: "up",
    history: buildHistory(28, -18, HOURS),
    lastAiResponseAt: new Date(Date.now() - 6 * 60_000).toISOString(),
    topics: [],
    productMentions: ["Paket Growth"],
  },
  {
    conversationId: "cv_0016", // Yusuf Ramadhan — CV Makmur Mitra
    score: 64,
    trend: "up",
    history: buildHistory(64, 40, HOURS),
    lastAiResponseAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    topics: [],
    productMentions: ["Paket Growth", "Demo"],
  },
  {
    conversationId: "cv_0019", // Indah Setiawan — CV Makmur Berkah
    score: -18,
    trend: "down",
    history: buildHistory(-18, -25, HOURS),
    lastAiResponseAt: new Date(Date.now() - 9 * 60_000).toISOString(),
    topics: ["negosiasi khusus"],
    productMentions: ["Paket Growth"],
  },
  {
    conversationId: "cv_0017", // Citra Gunawan — PT Mega Makmur
    score: 52,
    trend: "stable",
    history: buildHistory(52, 8, HOURS),
    lastAiResponseAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    topics: [],
    productMentions: ["Paket Starter"],
  },
  {
    conversationId: "cv_0030", // Tari Pratama — PT Sinar Bahari
    score: 12,
    trend: "stable",
    history: buildHistory(12, 0, HOURS),
    lastAiResponseAt: new Date(Date.now() - 7 * 60_000).toISOString(),
    topics: [],
    productMentions: ["Paket Growth"],
  },
  {
    conversationId: "cv_0018", // Ahmad Wibowo — PT Sahabat Cipta
    score: -65,
    trend: "down",
    history: buildHistory(-65, -45, HOURS),
    lastAiResponseAt: new Date(Date.now() - 28 * 60_000).toISOString(),
    topics: ["keluhan serius", "hukum"],
    productMentions: ["Paket Enterprise"],
  },
  {
    conversationId: "cv_0021", // Indah Wijaya — PT Sumber Sinar
    score: 38,
    trend: "up",
    history: buildHistory(38, 22, HOURS),
    lastAiResponseAt: new Date(Date.now() - 11 * 60_000).toISOString(),
    topics: [],
    productMentions: ["Paket Growth"],
  },

  // Non-WhatsApp — still drive the conversation-list sentiment badge.
  {
    conversationId: "cv_0020", // LinkedIn — Lina Gunawan
    score: 22,
    trend: "stable",
    history: buildHistory(22, 0, HOURS),
    lastAiResponseAt: new Date(Date.now() - 14 * 60_000).toISOString(),
    topics: [],
    productMentions: ["Paket Growth"],
  },
  {
    conversationId: "cv_0002", // Email — Lestari Handoko
    score: 48,
    trend: "up",
    history: buildHistory(48, 30, HOURS),
    lastAiResponseAt: new Date(Date.now() - 17 * 60_000).toISOString(),
    topics: [],
    productMentions: ["Paket Growth"],
  },
  {
    conversationId: "cv_0012", // LinkedIn — Hendra Halim
    score: 55,
    trend: "up",
    history: buildHistory(55, 28, HOURS),
    lastAiResponseAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    topics: [],
    productMentions: ["Demo"],
  },
  {
    conversationId: "cv_0004", // Instagram — Budi Setiawan
    score: 8,
    trend: "stable",
    history: buildHistory(8, 0, HOURS),
    lastAiResponseAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    topics: [],
    productMentions: [],
  },
  {
    conversationId: "cv_0028", // SMS — Nurul Puspita
    score: 30,
    trend: "up",
    history: buildHistory(30, 12, HOURS),
    lastAiResponseAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    topics: [],
    productMentions: ["Paket Growth"],
  },
  {
    conversationId: "cv_0001", // SMS — Reza Halim
    score: 18,
    trend: "stable",
    history: buildHistory(18, 0, HOURS),
    lastAiResponseAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    topics: [],
    productMentions: ["Paket Growth"],
  },
  {
    conversationId: "cv_0014", // Email — Nita Wijaya
    score: 42,
    trend: "stable",
    history: buildHistory(42, 4, HOURS),
    lastAiResponseAt: new Date(Date.now() - 16 * 60_000).toISOString(),
    topics: [],
    productMentions: ["Paket Growth"],
  },
  {
    conversationId: "cv_0025", // SMS — Gunawan Setiawan
    score: -8,
    trend: "down",
    history: buildHistory(-8, -18, HOURS),
    lastAiResponseAt: new Date(Date.now() - 19 * 60_000).toISOString(),
    topics: [],
    productMentions: ["Paket Growth"],
  },
];

/** Look up the sentiment for a conversation (returns a neutral default if none). */
export function getSentiment(conversationId: string): ConversationSentiment {
  const hit = conversationSentiments.find(
    (s) => s.conversationId === conversationId,
  );
  if (hit) return hit;
  return {
    conversationId,
    score: 0,
    trend: "stable",
    history: buildHistory(0, 0, HOURS),
    lastAiResponseAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    topics: [],
    productMentions: [],
  };
}

/** Recent handoff events — populates audit log style lists. */
export const handoffEvents: HandoffEvent[] = [
  {
    id: "ho_0001",
    conversationId: "cv_0018",
    trigger: "sentiment",
    triggeredAt: new Date(Date.now() - 26 * 60_000).toISOString(),
    assignedTo: "Andi Hidayat",
    note: "Sentimen turun di bawah ambang batas (−65).",
  },
  {
    id: "ho_0002",
    conversationId: "cv_0015",
    trigger: "complexity",
    triggeredAt: new Date(Date.now() - 18 * 60_000).toISOString(),
    note: "Topik 'refund' terdeteksi — eskalasi otomatis.",
  },
  {
    id: "ho_0003",
    conversationId: "cv_0019",
    trigger: "timeout",
    triggeredAt: new Date(Date.now() - 32 * 60_000).toISOString(),
    resolvedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    assignedTo: "Maya Kusuma",
    note: "Tidak ada balasan AI > 15 menit.",
  },
];

/**
 * Aggregate sentiment per product — exposed for Wave 2E analytics.
 * The numbers are deliberately illustrative and roughly track the per-
 * conversation scores above for the same product mentions.
 */
export const productSentiments: ProductSentiment[] = [
  {
    productName: "Paket Growth",
    averageScore: 22,
    mentions: 11,
    trendVsLastWeek: 6,
    sampleQuote: "Untuk paket Growth, ada diskon tahunan tidak?",
  },
  {
    productName: "Paket Starter",
    averageScore: 48,
    mentions: 4,
    trendVsLastWeek: 12,
    sampleQuote: "Starter sudah cukup untuk tim kami yang masih kecil.",
  },
  {
    productName: "Paket Enterprise",
    averageScore: -34,
    mentions: 3,
    trendVsLastWeek: -22,
    sampleQuote: "Harganya kurang sesuai untuk skala kami, perlu negosiasi.",
  },
  {
    productName: "Demo",
    averageScore: 62,
    mentions: 8,
    trendVsLastWeek: 9,
    sampleQuote: "Demo-nya jelas, langsung paham value-nya.",
  },
  {
    productName: "Onboarding",
    averageScore: 35,
    mentions: 5,
    trendVsLastWeek: 3,
    sampleQuote: "Onboarding cukup smooth, tim Anda responsif.",
  },
];

/**
 * Draft AI replies keyed by conversation. Falls back to a generic friendly
 * Bahasa Indonesia reply when no specific draft exists.
 */
const AI_DRAFTS: Record<string, string> = {
  cv_0015:
    "Mohon maaf atas kendalanya, Pak Reza. Saya teruskan ke tim agar segera ditindaklanjuti — apakah berkenan jika spesialis kami menghubungi langsung dalam 1 jam ke depan?",
  cv_0008:
    "Baik Bu Dian, terima kasih konfirmasinya 🙏 Saya kirimkan ringkasan implementasi dan estimasi onboarding hari ini ya.",
  cv_0016:
    "Tentu Pak Yusuf, demo Kamis pukul 14:00 WIB sudah saya catat. Saya kirimkan link meeting + agenda singkat dalam 5 menit ya.",
  cv_0019:
    "Terima kasih atas masukannya, Bu Indah. Saya siapkan opsi paket yang lebih sesuai dengan skala tim Anda — boleh saya jadwalkan diskusi 15 menit minggu ini?",
  cv_0017:
    "Halo Bu Citra, untuk paket Starter Rp 199.000/pengguna/bulan dan sudah termasuk integrasi WhatsApp & email. Mau saya kirim detail fiturnya?",
  cv_0030:
    "Baik Bu Tari, saya catat ya. Kalau berkenan, saya siapkan studi kasus klien sejenis di sektor Bapak/Ibu sebagai referensi.",
  cv_0018:
    "Saya mohon maaf atas pengalaman yang kurang nyaman, Pak Ahmad. Kasus ini saya eskalasi ke tim Senior — mohon tunggu konfirmasi dalam 30 menit.",
  cv_0021:
    "Tentu Bu Indah, untuk paket Growth Rp 449.000/pengguna/bulan. Boleh saya kirimkan proposal resmi via email?",
};

/** Get an AI-drafted reply for the conversation (or a friendly default). */
export function getAiDraft(conversationId: string, contactName: string): string {
  if (AI_DRAFTS[conversationId]) return AI_DRAFTS[conversationId];
  const firstName = contactName.split(" ")[0] ?? "Bapak/Ibu";
  return `Terima kasih atas pesannya, ${firstName}. Saya bantu jawab — boleh saya konfirmasi kebutuhannya secara singkat agar rekomendasi paling pas?`;
}

/** Default complexity topics shipped with the workspace. */
export const DEFAULT_COMPLEXITY_TOPICS = [
  "negosiasi khusus",
  "keluhan serius",
  "hukum",
  "refund",
];
