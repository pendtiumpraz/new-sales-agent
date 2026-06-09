// Backfill — guarantees that ct_0001 through ct_0010 each have at least one
// conversation + a couple of messages, so the "Workspace Terpadu" demo flow
// works for the top of the contacts list (the rows a stakeholder will click
// first). ct_0009 already has a real conversation in the seed JSON; the rest
// get a synthetic one here, deterministically generated.
//
// Imported and merged into the live `conversations` + `messages` exports by
// `lib/api-mock/data.ts` so both:
//   - hook-driven UIs (useConversations, useConversation) and
//   - the db-seed script
// see the same set without us editing the giant JSON files.

import type { Conversation, Message } from "@/lib/types";

interface Seed {
  contactId: string;
  contactName: string;
  company: string;
  channel: Conversation["channel"];
  avatarColor: string;
  lastMessage: string;
  preface: string; // outbound greeting from the sales rep
  reply: string;   // inbound reply from the prospect
}

const SEEDS: Seed[] = [
  {
    contactId: "ct_0001",
    contactName: "Teguh Nugroho",
    company: "PT Astra International",
    channel: "email",
    avatarColor: "#3B82F6",
    lastMessage: "Terima kasih, saya tunggu materinya minggu ini.",
    preface:
      "Selamat siang Pak Teguh, terima kasih sudah hadir di sesi webinar kami minggu lalu. Saya kirimkan ringkasan demo + price list Paket Growth untuk PT Astra International — silakan dilihat dan beri tahu kapan kita bisa diskusi lanjutan.",
    reply: "Terima kasih, saya tunggu materinya minggu ini.",
  },
  {
    contactId: "ct_0002",
    contactName: "Gunawan Handoko",
    company: "PT Gemilang Bumi",
    channel: "instagram",
    avatarColor: "#3B82F6",
    lastMessage: "Boleh share deck-nya via WA?",
    preface:
      "Halo Pak Gunawan! Sesuai obrolan tadi di DM, ini ringkasan fitur kami yang relevan untuk tim PT Gemilang Bumi. Apakah sudah cukup atau perlu detail tambahan?",
    reply: "Boleh share deck-nya via WA?",
  },
  {
    contactId: "ct_0003",
    contactName: "Wayan Utami",
    company: "Halodoc",
    channel: "sms",
    avatarColor: "#0D9488",
    lastMessage: "Saya bisa jam 14:00 besok.",
    preface:
      "Halo Bu Wayan, ini Andi dari Maira Sales. Mau konfirmasi jadwal demo singkat untuk tim Halodoc — boleh kita pilih slot besok?",
    reply: "Saya bisa jam 14:00 besok.",
  },
  {
    contactId: "ct_0004",
    contactName: "Maya Handoko",
    company: "PT Bahari Mega",
    channel: "instagram",
    avatarColor: "#0EA5E9",
    lastMessage: "Menarik, saya share ke tim ops dulu.",
    preface:
      "Halo Bu Maya — saya lihat PT Bahari Mega sedang ekspansi ke channel marketplace. Ini case study tim sales yang naik 38% reply rate dalam 2 bulan setelah pakai cadence kami.",
    reply: "Menarik, saya share ke tim ops dulu.",
  },
  {
    contactId: "ct_0005",
    contactName: "Tari Hartono",
    company: "CV Cahaya Mas",
    channel: "instagram",
    avatarColor: "#F59E0B",
    lastMessage: "Berapa harga untuk 5 sales?",
    preface:
      "Halo Bu Tari, salam kenal! Untuk tim UMKM seperti CV Cahaya Mas kami biasanya mulai dari Paket Starter — sudah termasuk inbox WhatsApp + cadence email. Boleh saya kirim breakdown harga?",
    reply: "Berapa harga untuk 5 sales?",
  },
  {
    contactId: "ct_0006",
    contactName: "Nurul Susanto",
    company: "PT Lestari Sentosa",
    channel: "whatsapp",
    avatarColor: "#14B8A6",
    lastMessage: "Tim saya tertarik, kita jadwalkan demo Kamis ya.",
    preface:
      "Halo Bu Nurul, kami sudah update fitur Pipeline Visual yang Anda tanyakan minggu lalu. Sekarang ada Kanban + AI scoring otomatis per deal. Mau kita demokan ke tim PT Lestari Sentosa?",
    reply: "Tim saya tertarik, kita jadwalkan demo Kamis ya.",
  },
  {
    contactId: "ct_0007",
    contactName: "Sari Permata",
    company: "PT Mega Makmur",
    channel: "whatsapp",
    avatarColor: "#FB5E3B",
    lastMessage: "Saya butuh integrasi Tokopedia juga, ada?",
    preface:
      "Halo Bu Sari, saya Andi dari Maira Sales. Dengar dari rekan Bu Hendra di PT Telkom, tim Bu Sari di PT Mega Makmur lagi cari solusi multi-channel. Boleh saya kenalan dulu via 15 menit call?",
    reply: "Saya butuh integrasi Tokopedia juga, ada?",
  },
  {
    contactId: "ct_0008",
    contactName: "Budi Nurhaliza",
    company: "CV Cahaya Mas",
    channel: "email",
    avatarColor: "#8B5CF6",
    lastMessage: "Saya akan reply detail kebutuhan akhir minggu ini.",
    preface:
      "Selamat pagi Pak Budi, mengikuti rekomendasi Bu Tari di CV Cahaya Mas — saya kirimkan proposal untuk tim sales Bapak. Kalau ada pertanyaan harga atau scope, langsung reply saja ya.",
    reply: "Saya akan reply detail kebutuhan akhir minggu ini.",
  },
  // ct_0009 (Hendra Halim) already has a real conversation in conversations.json
  {
    contactId: "ct_0010",
    contactName: "Mei Wibowo",
    company: "PT Bumi Anugerah",
    channel: "whatsapp",
    avatarColor: "#EC4899",
    lastMessage: "Tolong kirim invoice ke email finance ya.",
    preface:
      "Halo Bu Mei, terima kasih sudah konfirmasi pembelian Paket Growth untuk PT Bumi Anugerah! Kami siapkan invoice + onboarding dalam 1 hari kerja. Ada permintaan khusus?",
    reply: "Tolong kirim invoice ke email finance ya.",
  },
];

// Use a fixed timestamp so re-seeds + multi-render don't drift.
const T_NOW = new Date("2026-05-30T09:30:00+07:00").getTime();

export const firstTenConversations: Conversation[] = SEEDS.map((s, i) => ({
  id: `cv_first_${(i + 1).toString().padStart(2, "0")}`,
  contactId: s.contactId,
  contactName: s.contactName,
  company: s.company,
  channel: s.channel,
  lastMessage: s.lastMessage,
  lastTimestamp: new Date(T_NOW - i * 90 * 60_000).toISOString(),
  unread: i % 3 === 0 ? 1 : 0,
  avatarColor: s.avatarColor,
  assignedTo: "Almira Rana",
}));

export const firstTenMessages: Message[] = SEEDS.flatMap((s, i) => {
  const convoId = `cv_first_${(i + 1).toString().padStart(2, "0")}`;
  const t = T_NOW - i * 90 * 60_000;
  return [
    {
      id: `ms_first_${(i + 1).toString().padStart(2, "0")}_a`,
      conversationId: convoId,
      direction: "out",
      body: s.preface,
      timestamp: new Date(t - 3 * 60 * 60_000).toISOString(),
      status: "read",
    },
    {
      id: `ms_first_${(i + 1).toString().padStart(2, "0")}_b`,
      conversationId: convoId,
      direction: "in",
      body: s.reply,
      timestamp: new Date(t).toISOString(),
    },
  ];
});

/** Contact IDs guaranteed to have at least one conversation after this seed. */
export const FIRST_TEN_GUARANTEED_CONTACT_IDS = SEEDS.map((s) => s.contactId);
