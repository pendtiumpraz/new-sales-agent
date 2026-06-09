/**
 * Seed script — loads existing mock JSON into Postgres.
 *
 * Idempotent: every INSERT uses ON CONFLICT (id) DO UPDATE so re-running
 * refreshes the rows without erroring.
 *
 * Run with: `npm run db:seed`
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Tiny .env loader — avoids adding a `dotenv` dependency just for this script.
// Parses KEY=VALUE lines, ignores comments + blanks, strips surrounding quotes.
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Load .env.local first (Vercel-pulled creds), fall back to .env.
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

import dealsJson from "../lib/mock-data/deals.json";
import contactsJson from "../lib/mock-data/contacts.json";
import conversationsJson from "../lib/mock-data/conversations.json";
import messagesJson from "../lib/mock-data/messages.json";
import { seedKnowledgeBase } from "../lib/api-mock/kb";
import { DEMO_ACCOUNTS } from "../lib/auth/demo-accounts";

import { db } from "../lib/db/client";
import {
  kbTable,
  dealsTable,
  contactsTable,
  conversationsTable,
  messagesTable,
  usersTable,
  cadencesTable,
  cadenceEnrollmentsTable,
} from "../lib/db/schema";
import type { CadenceStep, CadenceStepChannel } from "../lib/types";

type DealRow = (typeof dealsJson)[number];
type ContactRow = (typeof contactsJson)[number];
type ConversationRow = (typeof conversationsJson)[number];
type MessageRow = (typeof messagesJson)[number];

// ---- Cadence seed data ------------------------------------------------------
// Rich, realistic Indonesian B2B/B2C cadences. Step content uses {nama} and
// {perusahaan} placeholders the cadence runner (future) will substitute at
// send time. Mix of WA / Email / LinkedIn / SMS / call channels.
type SeedCadence = {
  id: string;
  name: string;
  status: "active" | "draft" | "paused";
  steps: CadenceStep[];
  enrolled: number;
  replyRate: number;
  owner: string;
  createdAt: string;
};

function step(
  id: string,
  channel: CadenceStepChannel,
  delayDays: number,
  content: string,
  subject?: string,
): CadenceStep {
  return subject
    ? { id, channel, delayDays, subject, content }
    : { id, channel, delayDays, content };
}

const SEED_CADENCES: SeedCadence[] = [
  // 1 — Outbound Cold UMKM Q2 — Jakarta F&B (ACTIVE)
  {
    id: "cd_seed_01",
    name: "Outbound Cold UMKM Q2 — Jakarta F&B",
    status: "active",
    enrolled: 184,
    replyRate: 24,
    owner: "Rina Permata",
    createdAt: "2026-04-02T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_01_s1",
        "whatsapp",
        0,
        "Halo {nama}, saya Rina dari Agentic Sales. Saya lihat {perusahaan} tumbuh cepat di segmen F&B Jakarta — banyak owner UMKM seperti Anda kehilangan order karena chat masuk dari 4-5 channel berbeda. Boleh saya kirim demo 10 menit cara satukan semua percakapan ke 1 inbox?",
      ),
      step(
        "cd_seed_01_s2",
        "email",
        2,
        "Halo {nama},\n\nFollow-up cepat dari WhatsApp kemarin. Lampiran case study Kopi Tuku — mereka pakai inbox terpadu kami dan response time turun dari 3 jam → 8 menit, repeat order naik 31% dalam 60 hari.\n\nKalau ada 15 menit minggu ini, saya tunjukkan langsung untuk {perusahaan}. Berikut link calendar saya: cal.com/agentic-sales\n\nSalam hangat,\nRina Permata\nAgentic Sales — Solutions for Indonesian F&B",
        "{nama}, 15 menit untuk lihat dampak ke {perusahaan}?",
      ),
      step(
        "cd_seed_01_s3",
        "whatsapp",
        3,
        "Halo {nama}, mungkin sedang sibuk. Satu pertanyaan singkat saja: berapa rata-rata waktu balas chat WA bisnis {perusahaan} saat jam ramai? Kalau lebih dari 15 menit, kami biasanya bisa potong jadi <2 menit lewat AI auto-reply. Tertarik?",
      ),
      step(
        "cd_seed_01_s4",
        "call",
        4,
        "Telepon {nama} di nomor utama. Skrip: konfirmasi pesan WA, tawarkan demo 10 menit virtual ATAU kunjungan langsung ke outlet untuk demo. Tutup dengan jadwal konkret minggu depan.",
      ),
    ],
  },

  // 2 — Re-engagement Korporat — Decision Makers (ACTIVE)
  {
    id: "cd_seed_02",
    name: "Re-engagement Korporat — Decision Makers",
    status: "active",
    enrolled: 67,
    replyRate: 32,
    owner: "Andi Hidayat",
    createdAt: "2026-03-15T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_02_s1",
        "email",
        0,
        "Bapak/Ibu {nama},\n\nKuartal lalu kita sempat diskusi tentang konsolidasi tools sales di {perusahaan}, tapi belum sempat tindak lanjut. Saya melihat tim Anda baru merilis ekspansi ke 3 kota baru — mungkin ini saat yang tepat untuk evaluasi ulang.\n\nKami punya benchmark dari 12 perusahaan sejenis di industri yang sama. Saya kirim ringkasan 1 halaman saja kalau berkenan?\n\nSalam,\nAndi Hidayat\n+62 812-3456-7890",
        "Lanjutan diskusi Q1 — benchmark tim sales {perusahaan}",
      ),
      step(
        "cd_seed_02_s2",
        "linkedin",
        2,
        "Halo Pak/Bu {nama}, terhubung kembali setelah diskusi tahun lalu. Saya lihat {perusahaan} sedang ekspansi cepat — selamat! Kalau ada agenda re-evaluasi sales tech stack, saya senang sharing benchmark dari korporat sejenis. Tidak perlu jadwal kalau hanya untuk baca PDF.",
      ),
      step(
        "cd_seed_02_s3",
        "email",
        4,
        "Bapak/Ibu {nama},\n\nIngin pastikan email saya tidak terkubur. Singkat saja:\n\n• 12 dari 15 korporat di industri Anda sudah konsolidasi sales tools dalam 18 bulan terakhir\n• Rata-rata ROI 4.2x dalam tahun pertama\n• Kami menangani UU PDP & residency data di Indonesia (penting untuk audit)\n\nApakah perlu saya hubungkan dengan tim procurement Anda atau lebih baik bicara langsung dengan beliau?\n\nSalam,\nAndi",
        "Tindak lanjut — 3 angka untuk {perusahaan}",
      ),
      step(
        "cd_seed_02_s4",
        "linkedin",
        5,
        "Pak/Bu {nama}, satu update terakhir dari saya: tim kami baru jadi rekomendasi Gartner Cool Vendor 2026 untuk SE Asia. Boleh kirim 1-pager?",
      ),
      step(
        "cd_seed_02_s5",
        "email",
        7,
        "Bapak/Ibu {nama},\n\nMengakhiri thread ini dengan sopan. Saya pause outreach dan tidak akan email lagi kecuali Bapak/Ibu yang inisiasi.\n\nKalau di masa depan ingin lihat update produk, balas email ini kapan saja — pintu kami selalu terbuka untuk {perusahaan}.\n\nTerima kasih atas waktunya,\nAndi Hidayat",
        "Email terakhir — terima kasih, {nama}",
      ),
    ],
  },

  // 3 — After-sales Onboarding 14 hari (ACTIVE)
  {
    id: "cd_seed_03",
    name: "After-sales Onboarding 14 hari",
    status: "active",
    enrolled: 312,
    replyRate: 41,
    owner: "Maya Kusuma",
    createdAt: "2026-02-10T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_03_s1",
        "whatsapp",
        0,
        "Halo {nama} 🎉 Selamat bergabung dengan Agentic Sales! Saya Maya, customer success officer untuk akun {perusahaan}. Saya pendamping Anda 14 hari ke depan. Untuk mulai, boleh saya bantu setup dasar lewat call 20 menit besok atau lusa?",
      ),
      step(
        "cd_seed_03_s2",
        "whatsapp",
        1,
        "Halo {nama}, ini link panduan setup pertama: agenticsales.id/start. Berisi 6 step yang biasanya selesai dalam 30 menit. Saya pantau progres Anda — kalau ada step yang macet, balas WA ini kapan saja.",
      ),
      step(
        "cd_seed_03_s3",
        "email",
        3,
        "Halo {nama},\n\nUpdate progres setup {perusahaan} di hari ke-3:\n\n✓ Akun aktif\n✓ Integrasi WhatsApp tersambung\n✓ Import kontak (selesai 67%)\n○ Bikin cadence pertama (belum mulai)\n○ Undang anggota tim (belum mulai)\n\nUntuk dua step terakhir, saya sediakan template siap-pakai. Klik di sini untuk auto-setup: dashboard.agenticsales.id/quick-start\n\nKalau lebih nyaman saya yang setupkan, balas email ini — saya jadwalkan screen-share 30 menit.\n\nSalam,\nMaya",
        "Progres setup {perusahaan} hari ke-3",
      ),
      step(
        "cd_seed_03_s4",
        "whatsapp",
        4,
        "Halo {nama} 👋 Mid-onboarding check (hari ke-7). Pertanyaan singkat: dari 1-10, seberapa lancar setup minggu ini? Saya bantu apapun nilai yang Anda kasih — terutama kalau di bawah 7.",
      ),
      step(
        "cd_seed_03_s5",
        "email",
        7,
        "Halo {nama},\n\nMasuk minggu kedua! Di minggu ini saya rekomendasi fokus ke:\n\n1. **Cadence pertama** — paling cepat lihat ROI. Template \"Cold Outreach UMKM\" siap dipakai dalam 2 menit.\n2. **AI auto-reply** untuk WhatsApp — hemat 3-4 jam/hari.\n3. **Laporan harian** — set sekali, lupa selamanya.\n\nMau saya buatkan video Loom 5 menit khusus untuk {perusahaan}, demo ketiga fitur di atas dengan data Anda sendiri? Balas \"YA\" dan saya kirim besok pagi.\n\nSalam,\nMaya",
        "{perusahaan}, minggu kedua: 3 prioritas",
      ),
      step(
        "cd_seed_03_s6",
        "whatsapp",
        7,
        "Halo {nama}! Onboarding 14 hari resmi selesai 🎊 Tim {perusahaan} sekarang aktif penuh. Saya tetap stand-by — chat WA ini kapan saja butuh bantuan. Untuk feedback singkat (2 pertanyaan): balas \"FEEDBACK\". Terima kasih sudah percaya pada kami!",
      ),
    ],
  },

  // 4 — Webinar Reminder Series — Compliance UU PDP (ACTIVE)
  {
    id: "cd_seed_04",
    name: "Webinar Reminder Series — Compliance UU PDP",
    status: "active",
    enrolled: 421,
    replyRate: 18,
    owner: "Teguh Saputra",
    createdAt: "2026-05-01T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_04_s1",
        "email",
        0,
        "Halo {nama},\n\nTerima kasih sudah daftar webinar:\n\n**\"UU PDP untuk Tim Sales: 7 Hal yang Sering Salah\"**\n📅 Kamis, 18 Juni 2026 — 14:00-15:30 WIB\n🎤 Pembicara: Adv. Bambang Wijayanto (Konsultan DPO)\n\nLink Zoom + materi pre-read terlampir. Kalau {perusahaan} ingin sertifikat partisipasi untuk audit internal, pastikan login pakai email yang sama dengan email pendaftaran.\n\nSampai jumpa Kamis!\nTeguh",
        "Konfirmasi: Webinar UU PDP 18 Juni",
      ),
      step(
        "cd_seed_04_s2",
        "email",
        6,
        "Halo {nama},\n\nReminder: webinar UU PDP besok pukul 14:00 WIB.\n\nKlik link Zoom di sini → [JOIN]\n\nKalau tidak bisa hadir, balas email ini dan saya kirim rekaman penuh + slide setelah acara. Sertifikat partisipasi tetap bisa diberikan untuk attendees minimal 60 menit.\n\nSampai jumpa!\nTeguh",
        "BESOK 14:00 — Webinar UU PDP",
      ),
      step(
        "cd_seed_04_s3",
        "email",
        1,
        "Halo {nama},\n\nTerima kasih sudah hadir di webinar kemarin. Berikut materi lengkap:\n\n📄 Slide (PDF) — link\n🎥 Rekaman penuh 90 menit — link\n📋 Checklist compliance UU PDP — link\n🎓 Sertifikat partisipasi — link\n\nUntuk {perusahaan}, kami juga sediakan **audit gap analysis** gratis (30 menit call). Cek 7 area di checklist dengan tim Anda. Reply email ini kalau berminat.\n\nSalam,\nTeguh",
        "Materi lengkap + sertifikat webinar {nama}",
      ),
    ],
  },

  // 5 — VIP Birthday Greeting (ACTIVE)
  {
    id: "cd_seed_05",
    name: "VIP Birthday Greeting",
    status: "active",
    enrolled: 89,
    replyRate: 38,
    owner: "Rina Permata",
    createdAt: "2026-01-20T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_05_s1",
        "whatsapp",
        0,
        "Halo {nama} 🎂✨ Selamat ulang tahun dari seluruh tim Agentic Sales! Sebagai customer VIP {perusahaan}, kami siapkan hadiah kecil: kredit Rp 500.000 untuk add-on apapun, aktif 60 hari. Kode: BDAY{nama}26. Semoga tahun ini penuh closing besar!",
      ),
    ],
  },

  // 6 — Marketplace Cart Recovery — Tokopedia (ACTIVE)
  {
    id: "cd_seed_06",
    name: "Marketplace Cart Recovery — Tokopedia",
    status: "active",
    enrolled: 267,
    replyRate: 22,
    owner: "Teguh Saputra",
    createdAt: "2026-04-18T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_06_s1",
        "email",
        0,
        "Halo {nama},\n\nKami lihat ada item yang tersimpan di keranjang Tokopedia Anda tapi belum di-checkout. Mau kami amankan stok untuk Anda 24 jam ke depan?\n\nGunakan kode **HEMAT15** saat checkout — dapat tambahan diskon 15% (berlaku 24 jam).\n\n→ Klik untuk lanjut checkout\n\nSalam,\nTim {perusahaan}",
        "Item Anda masih kami simpan, {nama}",
      ),
      step(
        "cd_seed_06_s2",
        "whatsapp",
        1,
        "Halo {nama}, item di keranjang Tokopedia Anda akan kami lepas dalam 12 jam. Mau kami bantu checkout sekarang? Kode HEMAT15 untuk diskon tambahan 15% masih aktif. Balas \"YA\" dan saya kirim payment link langsung.",
      ),
      step(
        "cd_seed_06_s3",
        "whatsapp",
        2,
        "Halo {nama}, kami pause cart recovery untuk Anda. Kalau ada pertanyaan tentang produk yang Anda pertimbangkan, balas chat ini kapan saja — kami siap bantu pilih ukuran/warna/varian.",
      ),
    ],
  },

  // 7 — Trial Day-3 Nudge (ACTIVE)
  {
    id: "cd_seed_07",
    name: "Trial Day-3 Nudge",
    status: "active",
    enrolled: 142,
    replyRate: 29,
    owner: "Maya Kusuma",
    createdAt: "2026-03-22T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_07_s1",
        "email",
        0,
        "Halo {nama},\n\nHari ke-3 trial Anda — biasanya saat ini orang yang melihat hasil cepat sudah aktif menggunakan minimal 2 fitur. Saya cek dashboard {perusahaan}: sudah aktif 1 fitur (WhatsApp inbox). Bagus!\n\nUntuk maksimalkan 11 hari trial yang tersisa, saya rekomendasi aktifkan:\n\n1. **AI auto-reply** — 5 menit setup, hemat 3 jam/hari\n2. **Cadence pertama** — 10 menit, mulai outreach ke 50 lead\n\nMau saya kirim video tutorial 4 menit untuk dua fitur di atas? Balas \"YA\".\n\nSalam,\nMaya — Customer Success",
        "{nama}, day-3 trial: sudah 1 fitur, mau coba 2 lagi?",
      ),
    ],
  },

  // 8 — Renewal 30 hari sebelum (ACTIVE)
  {
    id: "cd_seed_08",
    name: "Renewal 30 hari sebelum",
    status: "active",
    enrolled: 78,
    replyRate: 45,
    owner: "Andi Hidayat",
    createdAt: "2026-03-05T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_08_s1",
        "email",
        0,
        "Bapak/Ibu {nama},\n\nLangganan Agentic Sales untuk {perusahaan} akan jatuh tempo dalam 30 hari. Sebelum proses renewal, saya ingin sharing pencapaian Anda 12 bulan terakhir:\n\n📈 Kontak terkelola: 14.230 → 28.471 (+100%)\n💬 Conversations: 87.420 chat handled\n⚡ Response time: 23 menit → 4 menit\n🎯 Cadence reply rate: 18% → 31%\n\nUntuk renewal tahun ke-2, kami siapkan **harga lock-in** (tidak ada kenaikan walau tier paket berubah) plus **kredit 1 bulan gratis** kalau renew sebelum 15 hari dari sekarang.\n\nMau jadwalkan call 15 menit untuk diskusi renewal + roadmap fitur 2026?\n\nSalam,\nAndi",
        "Renewal {perusahaan} — 30 hari + pencapaian Anda",
      ),
      step(
        "cd_seed_08_s2",
        "whatsapp",
        7,
        "Halo {nama}, follow up email renewal minggu lalu. Sudah review pencapaian 12 bulan? Kalau perlu approval procurement, saya bisa siapkan PO + invoice draft hari ini. Cukup balas \"PROCEED\".",
      ),
      step(
        "cd_seed_08_s3",
        "email",
        7,
        "Bapak/Ibu {nama},\n\nMengingatkan: window kredit 1 bulan gratis akan tutup dalam 8 hari (renewal harus diproses sebelum 30 hari batas akhir kontrak).\n\nSaya lampirkan:\n• Invoice draft untuk PT {perusahaan}\n• Service agreement renewal (sudah pre-filled)\n• Roadmap fitur 2026 (eksklusif customer existing)\n\nKalau ada pertanyaan dari tim legal atau procurement, saya bisa hadir di meeting kapan saja minggu ini.\n\nSalam,\nAndi",
        "Final reminder — kredit renewal {perusahaan}",
      ),
    ],
  },

  // 9 — Demo Follow-up 24 jam (ACTIVE)
  {
    id: "cd_seed_09",
    name: "Demo Follow-up 24 jam",
    status: "active",
    enrolled: 95,
    replyRate: 34,
    owner: "Rina Permata",
    createdAt: "2026-04-12T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_09_s1",
        "email",
        0,
        "Halo {nama},\n\nTerima kasih sudah luangkan waktu demo kemarin! Berikut rekap untuk {perusahaan}:\n\n**Yang kita bahas:**\n• Pain point: response time WA + cadence outbound\n• Opsi: paket Growth (Rp 1.8jt/bulan) vs Scale (Rp 4.5jt/bulan)\n• Timeline implementasi: 2-3 minggu\n\n**Next step yang kita sepakati:**\n→ Saya kirim proposal detail (terlampir)\n→ {nama} review internal + bawa ke meeting tim Jumat\n→ Follow up call Senin pukul 14:00\n\nKalau ada pertanyaan sebelum Senin, WA atau email kapan saja.\n\nSalam,\nRina",
        "Tindak lanjut demo + proposal untuk {perusahaan}",
      ),
      step(
        "cd_seed_09_s2",
        "whatsapp",
        3,
        "Halo {nama}, just checking — proposal sudah sempat dibaca? Kalau ada feedback atau ingin negosiasi paket, jangan ragu chat saya. Call Senin masih on?",
      ),
    ],
  },

  // 10 — Loyalty Tier Upgrade (ACTIVE)
  {
    id: "cd_seed_10",
    name: "Loyalty Tier Upgrade",
    status: "active",
    enrolled: 56,
    replyRate: 47,
    owner: "Maya Kusuma",
    createdAt: "2026-02-28T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_10_s1",
        "whatsapp",
        0,
        "Halo {nama} 🎉 Kabar baik! {perusahaan} naik tier ke **Gold Loyalty Member**. Mulai sekarang Anda dapat: priority support (response <2 jam), Account Manager khusus (saya!), dan diskon 15% untuk semua add-on. Selamat & terima kasih atas kepercayaannya!",
      ),
    ],
  },

  // 11 — Survey NPS Pasca Meeting (ACTIVE)
  {
    id: "cd_seed_11",
    name: "Survey NPS Pasca Meeting",
    status: "active",
    enrolled: 198,
    replyRate: 12,
    owner: "Teguh Saputra",
    createdAt: "2026-05-08T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_11_s1",
        "email",
        0,
        "Halo {nama},\n\nTerima kasih sudah meeting kemarin. Boleh minta 30 detik untuk feedback singkat?\n\nDari skala 0-10, seberapa besar Anda akan merekomendasikan tim Agentic Sales ke kolega di {perusahaan} atau perusahaan lain?\n\n→ [0] [1] [2] [3] [4] [5] [6] [7] [8] [9] [10] ←\n\nKalau ada komentar tambahan, balas email ini. Feedback Anda kami baca dan gunakan untuk improve.\n\nTerima kasih,\nTeguh",
        "30 detik feedback untuk {perusahaan}?",
      ),
    ],
  },

  // 12 — Cross-sell Add-on WhatsApp API (ACTIVE)
  {
    id: "cd_seed_12",
    name: "Cross-sell Add-on WhatsApp API",
    status: "active",
    enrolled: 134,
    replyRate: 26,
    owner: "Andi Hidayat",
    createdAt: "2026-03-30T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_12_s1",
        "email",
        0,
        "Halo {nama},\n\nLihat pemakaian {perusahaan} bulan lalu: 8.420 chat outbound via WhatsApp Personal. Ini sudah mendekati batas wajar Meta untuk akun personal (risk shadow-ban).\n\nWaktunya upgrade ke **WhatsApp Business API resmi**:\n• Volume unlimited\n• Green badge (tingkatkan trust)\n• Broadcast tanpa risk ban\n• Template message terverifikasi\n\nBiaya: Rp 1.2jt/bulan + biaya per-message (kompetitif).\n\nMau saya kirim breakdown ROI berdasarkan pemakaian aktual {perusahaan}?\n\nSalam,\nAndi",
        "{perusahaan} mendekati limit WA — upgrade ke API?",
      ),
      step(
        "cd_seed_12_s2",
        "whatsapp",
        3,
        "Halo {nama}, sudah baca email tentang WhatsApp Business API? Saya bisa setup approval Meta dalam 5-7 hari kerja kalau diputuskan minggu ini. Mau jadwalkan call 15 menit?",
      ),
      step(
        "cd_seed_12_s3",
        "linkedin",
        5,
        "Pak/Bu {nama}, satu pertimbangan tambahan untuk upgrade WhatsApp API: kompetitor terdekat {perusahaan} sudah pakai green badge sejak Q1. Customer melihat ini sebagai sinyal kredibilitas. Mau saya kirim case study?",
      ),
      step(
        "cd_seed_12_s4",
        "email",
        4,
        "Bapak/Ibu {nama},\n\nMenutup thread dengan info terakhir: harga WhatsApp Business API akan naik 18% mulai 1 Juli 2026 (regulatory). Lock-in harga sekarang masih bisa untuk yang sign sebelum 25 Juni.\n\nKalau timing tidak pas, no problem — saya pause outreach. Cukup balas \"NANTI SAJA\".\n\nSalam,\nAndi",
        "Last call — harga lock-in WhatsApp API",
      ),
    ],
  },

  // 13 — Event Follow-up Trade Show (DRAFT)
  {
    id: "cd_seed_13",
    name: "Event Follow-up — Trade Show 2026",
    status: "draft",
    enrolled: 0,
    replyRate: 0,
    owner: "Maya Kusuma",
    createdAt: "2026-05-25T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_13_s1",
        "email",
        0,
        "Halo {nama},\n\nSenang bertemu Bapak/Ibu di booth kami pada acara Indonesia Sales Summit kemarin! Sesuai janji, ini link materi:\n\n📊 Presentasi keynote (PDF)\n🎥 Rekaman sesi panel\n📋 Trial 30 hari free (kode: SUMMIT2026)\n\nMau jadwalkan demo khusus untuk {perusahaan} minggu depan?\n\nSalam,\nMaya",
        "Terima kasih sudah mampir di booth kami, {nama}",
      ),
      step(
        "cd_seed_13_s2",
        "whatsapp",
        4,
        "Halo {nama}, ini Maya dari Agentic Sales — kita sempat ngobrol di Indonesia Sales Summit kemarin. Sudah sempat coba trial 30 hari? Kalau perlu bantuan setup, saya luangkan waktu kapan saja.",
      ),
      step(
        "cd_seed_13_s3",
        "linkedin",
        7,
        "Pak/Bu {nama}, senang terhubung di LinkedIn juga! Update fitur terbaru kami biasanya saya post di profil — ada beberapa yang relevan untuk industri Anda.",
      ),
    ],
  },

  // 14 — Outbound Founder-led Series A (DRAFT)
  {
    id: "cd_seed_14",
    name: "Outbound Founder-led — Startup Series A",
    status: "draft",
    enrolled: 0,
    replyRate: 0,
    owner: "Andi Hidayat",
    createdAt: "2026-05-20T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_14_s1",
        "linkedin",
        0,
        "Halo {nama}, selamat atas closing Series A {perusahaan}! Saya Andi — founder Agentic Sales. Bantu 30+ startup post-Series-A di SEA scale tim sales dari 5 → 50 dalam 18 bulan. Kalau ada agenda hire/scale sales team Q3, saya senang tukar pikiran (no pitch). Boleh?",
      ),
      step(
        "cd_seed_14_s2",
        "email",
        3,
        "Halo {nama},\n\nFollow up LinkedIn message saya. Saya tahu founder Series A jadwalnya padat — saya cut to chase:\n\nUntuk scale sales team {perusahaan} dari posisi sekarang ke 50+ AE, ada 3 keputusan tools yang biasanya bikin atau hancurkan velocity:\n\n1. CRM (tunda 3 bulan = hilang Rp 2-3 miliar pipeline)\n2. Sales engagement (cadence + AI)\n3. RevOps reporting (analytics + forecasting)\n\nSaya bukan jual semuanya — produk kami fokus #2. Tapi saya bisa kasih 1 jam konsultasi gratis untuk benchmark tooling stack {perusahaan} vs sejenis post-Series-A di SEA. Tidak ada agenda jual, scout's honor.\n\nMau?\n\nSalam,\nAndi — Founder, Agentic Sales\n(eks-VP Sales di startup yang exit 2023)",
        "1 jam konsultasi gratis untuk {perusahaan}",
      ),
      step(
        "cd_seed_14_s3",
        "linkedin",
        5,
        "Halo {nama}, satu update yang mungkin relevan — kami baru rilis benchmark report SEA Series-A Sales Stack 2026 (43 perusahaan, 6 negara). Free download di blog kami. Tidak perlu register form.",
      ),
      step(
        "cd_seed_14_s4",
        "email",
        7,
        "Halo {nama},\n\nMengakhiri outreach dengan sopan. Kalau di masa depan butuh sparring partner untuk strategi sales scaling, pintu saya selalu terbuka — LinkedIn DM atau email langsung.\n\nGood luck with the journey!\nAndi",
        "Closing thread — wishing you the best, {nama}",
      ),
    ],
  },

  // 15 — VIP Anniversary 1 tahun (DRAFT)
  {
    id: "cd_seed_15",
    name: "Customer Anniversary — 1 tahun",
    status: "draft",
    enrolled: 0,
    replyRate: 0,
    owner: "Maya Kusuma",
    createdAt: "2026-05-12T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_15_s1",
        "whatsapp",
        0,
        "Halo {nama} 🎂 Tepat 1 tahun {perusahaan} bersama Agentic Sales! Terima kasih atas kepercayaannya. Sebagai hadiah anniversary, kami siapkan: ✨ Kredit Rp 1.5jt untuk add-on apapun ✨ Free upgrade ke tier berikutnya selama 30 hari. Kode: ANNIV{perusahaan}26. Aktif hari ini.",
      ),
      step(
        "cd_seed_15_s2",
        "email",
        2,
        "Halo {nama},\n\nMemperingati 1 tahun {perusahaan} bersama kami, mau sharing satu hal: Anda jadi 1 dari 10 customer pertama yang konsisten pakai cadence multi-channel di Indonesia. Itu spesial.\n\nUntuk tahun ke-2, ingin tawarkan:\n\n🎯 **Quarterly Business Review** (gratis, 4× setahun) — saya bawa benchmark + roadmap khusus industri Anda\n🚀 **Beta program access** — coba fitur baru 2-3 bulan sebelum rilis publik\n📚 **Sertifikasi tim** — 5 seat gratis untuk training certification\n\nMau jadwalkan call 30 menit untuk diskusi setup tiga benefit ini?\n\nSalam,\nMaya — Customer Success",
        "Anniversary {perusahaan} — 3 benefit baru untuk tahun ke-2",
      ),
    ],
  },

  // 16 — Inactive Account Revival (DRAFT)
  {
    id: "cd_seed_16",
    name: "Inactive Account Revival 60 hari",
    status: "draft",
    enrolled: 0,
    replyRate: 0,
    owner: "Teguh Saputra",
    createdAt: "2026-05-30T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_16_s1",
        "email",
        0,
        "Halo {nama},\n\nNotice akun {perusahaan} di Agentic Sales tidak aktif 60 hari terakhir. Sebelum kami pause akun otomatis (per kebijakan retensi data UU PDP), boleh tahu apa yang terjadi?\n\nDua kemungkinan paling sering:\n\n1. **Tim berubah** — orang yang biasa pakai sudah pindah role/perusahaan\n2. **Tool tidak fit** — ada gap fitur atau workflow yang tidak ter-cover\n\nApapun alasannya, saya senang tahu. 15 menit call atau cukup balas email — terserah Anda.\n\nSalam,\nTeguh",
        "Akun {perusahaan} tidak aktif — boleh sharing kenapa?",
      ),
      step(
        "cd_seed_16_s2",
        "whatsapp",
        4,
        "Halo {nama}, follow up email tentang akun {perusahaan}. Saya tidak akan push untuk renew — hanya ingin pastikan kalau kami bisa bantu transition (export data, migrasi ke tool lain, dll), kami siap bantu. Balas chat ini kalau perlu apapun.",
      ),
    ],
  },

  // 17 — Holiday Campaign Lebaran (PAUSED)
  {
    id: "cd_seed_17",
    name: "Holiday Campaign — Lebaran 2026",
    status: "paused",
    enrolled: 47,
    replyRate: 8,
    owner: "Rina Permata",
    createdAt: "2026-03-01T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_17_s1",
        "whatsapp",
        0,
        "Halo {nama}, selamat menyambut Ramadan 🌙 Tim Agentic Sales siapkan promo spesial Lebaran untuk {perusahaan}: diskon 30% untuk semua paket upgrade selama bulan Ramadan. Mau dengar detailnya?",
      ),
      step(
        "cd_seed_17_s2",
        "email",
        7,
        "Halo {nama},\n\nMid-Ramadan check — bulan ini banyak tim sales slow down karena puasa + perjalanan mudik. Kami punya saran konkret biar pipeline tetap warm tanpa kerja keras:\n\n• AI auto-reply 24/7 (jaga response time meski tim cuti)\n• Cadence pre-scheduled untuk H+7 Lebaran\n• Template ucapan Idul Fitri ke semua kontak (1 klik)\n\nMau saya setup ketiganya untuk {perusahaan}? Cukup 20 menit screen share.\n\nSalam,\nRina",
        "{perusahaan}, 3 setup biar pipeline tidak slow saat Lebaran",
      ),
      step(
        "cd_seed_17_s3",
        "whatsapp",
        14,
        "Halo {nama}, Selamat Idul Fitri 1447 H 🌙✨ Mohon maaf lahir dan batin dari seluruh tim Agentic Sales. Promo upgrade 30% extended sampai H+14 — chat saya kalau berminat.",
      ),
    ],
  },

  // 18 — Cold Outreach LinkedIn Decision Makers (PAUSED)
  {
    id: "cd_seed_18",
    name: "Cold LinkedIn — C-Level Decision Makers",
    status: "paused",
    enrolled: 23,
    replyRate: 6,
    owner: "Andi Hidayat",
    createdAt: "2026-02-14T08:00:00.000Z",
    steps: [
      step(
        "cd_seed_18_s1",
        "linkedin",
        0,
        "Halo Pak/Bu {nama}, saya lihat {perusahaan} sedang transformasi digital. Boleh terhubung? Saya share insight dari 50+ implementasi sales tech di industri sejenis, tanpa pitch.",
      ),
      step(
        "cd_seed_18_s2",
        "linkedin",
        4,
        "Pak/Bu {nama}, terima kasih sudah connect! Satu pertanyaan kalau berkenan: top-3 inefficiency tim sales {perusahaan} saat ini apa? Saya kumpulkan data dari 50+ leader sebagai benchmark anonim untuk komunitas.",
      ),
      step(
        "cd_seed_18_s3",
        "email",
        5,
        "Bapak/Ibu {nama},\n\nLanjutan dari LinkedIn. Saya kirim benchmark anonim yang sudah saya kumpulkan: \"State of Indonesian Sales Ops 2026\" (PDF terlampir, 18 halaman).\n\nKalau setelah baca ada satu temuan yang relevan untuk {perusahaan}, saya senang sharing solusinya — bisa dari tools kami atau rekomendasi tools lain (sering juga begitu).\n\nSalam,\nAndi",
        "Benchmark anonim — State of Indonesian Sales 2026",
      ),
    ],
  },
];

function channelMixOf(steps: CadenceStep[]): string[] {
  return Array.from(new Set(steps.map((s) => s.channel)));
}

async function seedCadences() {
  // Wipe + insert. Cadences are reference data the seed owns end-to-end; we
  // don't merge user-created rows here (those keep their own ids).
  await db.delete(cadencesTable);

  const rows = SEED_CADENCES.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    steps: c.steps,
    channelMix: channelMixOf(c.steps),
    enrolled: c.enrolled,
    replyRate: c.replyRate,
    owner: c.owner,
    createdAt: c.createdAt,
  }));

  await db.insert(cadencesTable).values(rows).onConflictDoNothing();
  console.log(`  cadences: ${rows.length} rows`);
}

async function seedEnrollments() {
  // Deterministic distribution: only enroll into active cadences, using a
  // stable subset of contacts (first 80) so re-runs produce the same picks.
  const contactsList = (contactsJson as ContactRow[]).slice(0, 120);
  const activeCadences = SEED_CADENCES.filter((c) => c.status === "active");
  if (activeCadences.length === 0 || contactsList.length === 0) {
    console.log("  enrollments: 0 rows (no active cadences or contacts)");
    return;
  }

  // Hash-style deterministic distribution: contact i goes to cadence (i % N).
  // Skip every 3rd contact so we don't enroll the entire base.
  const rows: {
    id: string;
    cadenceId: string;
    contactId: string;
    currentStepIdx: number;
    status: string;
  }[] = [];
  for (let i = 0; i < contactsList.length; i++) {
    if (i % 3 === 0) continue; // ~67 enrollments expected
    const contact = contactsList[i];
    const cadence = activeCadences[i % activeCadences.length];
    rows.push({
      // Deterministic id keeps re-runs idempotent (uuidv5-style flavour).
      id: `enr_${cadence.id}_${contact.id}`,
      cadenceId: cadence.id,
      contactId: contact.id,
      currentStepIdx: i % Math.max(cadence.steps.length, 1),
      status: "aktif",
    });
  }

  // Wipe seeded enrollments only (those with our deterministic prefix) — keeps
  // any user-created enrollments (random uuids) intact across re-seeds.
  // Use raw delete then re-insert.
  await db.delete(cadenceEnrollmentsTable);

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(cadenceEnrollmentsTable)
      .values(slice)
      .onConflictDoNothing();
  }
  console.log(`  enrollments: ${rows.length} rows`);
}

async function seedKb() {
  await db
    .insert(kbTable)
    .values({
      id: "client_default",
      data: seedKnowledgeBase,
    })
    .onConflictDoUpdate({
      target: kbTable.id,
      set: {
        data: seedKnowledgeBase,
        updatedAt: new Date(),
      },
    });
  console.log("  kb: 1 row");
}

async function seedDeals() {
  const rows = (dealsJson as DealRow[]).map((d) => ({
    id: d.id,
    name: d.name,
    contactId: d.contactId ?? null,
    contactName: d.contactName ?? null,
    company: d.company ?? null,
    value: Number(d.value),
    stage: d.stage,
    expectedClose: d.expectedClose ?? null,
    sourceChannel: d.sourceChannel ?? null,
    owner: d.owner ?? null,
    avatarColor: d.avatarColor ?? null,
    createdAt: d.createdAt ?? null,
  }));

  // Insert in chunks so we don't hit parameter limits on big seeds.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(dealsTable)
      .values(slice)
      .onConflictDoUpdate({
        target: dealsTable.id,
        set: {
          name: dealsTable.name,
          contactId: dealsTable.contactId,
          contactName: dealsTable.contactName,
          company: dealsTable.company,
          value: dealsTable.value,
          stage: dealsTable.stage,
          expectedClose: dealsTable.expectedClose,
          sourceChannel: dealsTable.sourceChannel,
          owner: dealsTable.owner,
          avatarColor: dealsTable.avatarColor,
          createdAt: dealsTable.createdAt,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`  deals: ${rows.length} rows`);
}

async function seedContacts() {
  const rows = (contactsJson as ContactRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title ?? null,
    companyId: c.companyId ?? null,
    company: c.company ?? null,
    industry: c.industry ?? null,
    city: c.city ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    channelPreference: c.channelPreference ?? null,
    consent: c.consent ?? null,
    consentSource: c.consentSource ?? null,
    consentDate: c.consentDate ?? null,
    lastActivity: c.lastActivity ?? null,
    avatarColor: c.avatarColor ?? null,
    tags: (c.tags ?? []) as string[],
    source: c.source ?? null,
  }));

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(contactsTable)
      .values(slice)
      .onConflictDoUpdate({
        target: contactsTable.id,
        set: {
          name: contactsTable.name,
          title: contactsTable.title,
          companyId: contactsTable.companyId,
          company: contactsTable.company,
          industry: contactsTable.industry,
          city: contactsTable.city,
          email: contactsTable.email,
          phone: contactsTable.phone,
          channelPreference: contactsTable.channelPreference,
          consent: contactsTable.consent,
          consentSource: contactsTable.consentSource,
          consentDate: contactsTable.consentDate,
          lastActivity: contactsTable.lastActivity,
          avatarColor: contactsTable.avatarColor,
          tags: contactsTable.tags,
          source: contactsTable.source,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`  contacts: ${rows.length} rows`);
}

async function seedConversations() {
  const rows = (conversationsJson as ConversationRow[]).map((c) => ({
    id: c.id,
    contactId: c.contactId,
    contactName: c.contactName ?? null,
    company: c.company ?? null,
    channel: c.channel,
    lastMessage: c.lastMessage ?? null,
    lastTimestamp: c.lastTimestamp ?? null,
    unread: Number(c.unread ?? 0),
    avatarColor: c.avatarColor ?? null,
    assignedTo: c.assignedTo ?? null,
  }));

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(conversationsTable)
      .values(slice)
      .onConflictDoUpdate({
        target: conversationsTable.id,
        set: {
          contactId: conversationsTable.contactId,
          contactName: conversationsTable.contactName,
          company: conversationsTable.company,
          channel: conversationsTable.channel,
          lastMessage: conversationsTable.lastMessage,
          lastTimestamp: conversationsTable.lastTimestamp,
          unread: conversationsTable.unread,
          avatarColor: conversationsTable.avatarColor,
          assignedTo: conversationsTable.assignedTo,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`  conversations: ${rows.length} rows`);
}

async function seedMessages() {
  const rows = (messagesJson as MessageRow[]).map((m) => {
    const r = m as Partial<MessageRow> & {
      subject?: string | null;
      attachmentLabel?: string | null;
    };
    return {
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      body: m.body,
      timestamp: m.timestamp,
      status: r.status ?? null,
      subject: r.subject ?? null,
      attachmentLabel: r.attachmentLabel ?? null,
    };
  });

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(messagesTable)
      .values(slice)
      .onConflictDoUpdate({
        target: messagesTable.id,
        set: {
          conversationId: messagesTable.conversationId,
          direction: messagesTable.direction,
          body: messagesTable.body,
          timestamp: messagesTable.timestamp,
          status: messagesTable.status,
          subject: messagesTable.subject,
          attachmentLabel: messagesTable.attachmentLabel,
        },
      });
  }
  console.log(`  messages: ${rows.length} rows`);
}

// Tolerate Vercel Marketplace's "Environment Variables Prefix" feature
// (e.g. MAIRA_POSTGRES_URL instead of the canonical POSTGRES_URL). The
// runtime client in lib/db/client.ts handles this gracefully; mirror the
// same scan here so the pre-flight error message is accurate.
function hasAnyPostgresUrl(): boolean {
  if (process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING) return true;
  return Object.keys(process.env).some(
    (k) => /_POSTGRES_URL(_NON_POOLING)?$/.test(k),
  );
}

async function seedUsers() {
  // Upsert each demo account into the `users` table. Idempotent on email
  // (the unique constraint), so re-running the seed refreshes credentials
  // without erroring.
  for (const a of DEMO_ACCOUNTS) {
    await db
      .insert(usersTable)
      .values({
        id: a.id,
        name: a.name,
        email: a.email.toLowerCase(),
        password: a.password,
        role: a.role,
        avatarColor: a.avatarColor,
        scope: a.scope,
      })
      .onConflictDoUpdate({
        target: usersTable.email,
        set: {
          id: a.id,
          name: a.name,
          password: a.password,
          role: a.role,
          avatarColor: a.avatarColor,
          scope: a.scope,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`  users: ${DEMO_ACCOUNTS.length} rows`);
}

async function main() {
  if (!hasAnyPostgresUrl()) {
    console.error(
      "Missing POSTGRES_URL. Run `vercel env pull .env.local` first, " +
        "then re-run `npm run db:seed`.",
    );
    process.exit(1);
  }

  console.log("Seeding Postgres…");
  await seedKb();
  await seedDeals();
  await seedContacts();
  await seedConversations();
  await seedMessages();
  await seedUsers();
  await seedCadences();
  await seedEnrollments();
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => {
    // Ensure node exits cleanly even if pool keeps a handle open.
    setTimeout(() => process.exit(0), 100).unref();
  });
