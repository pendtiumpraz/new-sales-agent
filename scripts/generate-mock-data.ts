/* eslint-disable no-console */
// Seeded mock-data generator for the Agentic AI Sales prototype.
// Run: npm run seed  (writes JSON files into lib/mock-data/)
import { faker } from "@faker-js/faker";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

faker.seed(2026);

const OUT = path.join(process.cwd(), "lib", "mock-data");
mkdirSync(OUT, { recursive: true });

const NOW = new Date("2026-05-25T10:00:00+07:00");

// ---- Curated Indonesian source data -----------------------------------------
const FIRST = [
  "Budi", "Siti", "Ahmad", "Putri", "Dewi", "Rizki", "Mei", "Bambang",
  "Andi", "Joko", "Sri", "Agus", "Indah", "Wayan", "Eka", "Fitri", "Hendra",
  "Lina", "Reza", "Yusuf", "Maya", "Dian", "Arif", "Nita", "Gunawan",
  "Rina", "Teguh", "Sari", "Hadi", "Wati", "Anton", "Ratih", "Slamet",
  "Citra", "Bayu", "Lestari", "Iwan", "Nurul", "Surya", "Tari",
];
const LAST = [
  "Santoso", "Nurhaliza", "Wijaya", "Pratama", "Lestari", "Sutrisno",
  "Hidayat", "Kusuma", "Wibowo", "Halim", "Saputra", "Permata", "Gunawan",
  "Hartono", "Susanto", "Maharani", "Setiawan", "Anggraini", "Nugroho",
  "Puspita", "Ramadhan", "Cahyono", "Firmansyah", "Handoko", "Utami",
];
const COMPANY_PREFIX = ["PT", "CV", "PT", "PT", "CV", "Koperasi", "PT", "UD"];
const COMPANY_WORDS = [
  "Sentosa", "Mitra", "Sejahtera", "Abadi", "Sumber", "Rejeki", "Sinar",
  "Mas", "Jaya", "Karya", "Mandiri", "Bahari", "Nusantara", "Cahaya",
  "Berkah", "Lestari", "Makmur", "Sukses", "Gemilang", "Prima", "Anugerah",
  "Sentral", "Mega", "Cipta", "Tunggal", "Sahabat", "Persada", "Bumi",
];
const REAL_COMPANIES = [
  "PT Bank Mandiri Tbk", "PT Telekomunikasi Indonesia", "PT Astra International",
  "PT Sinar Mas", "Halodoc", "PT Bank Rakyat Indonesia", "PT Unilever Indonesia",
  "PT Indofood Sukses Makmur", "Bank Central Asia", "PT Pertamina",
];
const CITIES = [
  "Jakarta", "Surabaya", "Bandung", "Medan", "Semarang", "Makassar",
  "Palembang", "Denpasar", "Yogyakarta", "Tangerang",
];
const INDUSTRIES = [
  "BUMN", "BPR", "Retail", "FMCG", "Manufaktur", "Teknologi", "Perbankan",
  "Asuransi", "Properti", "Logistik",
];
const TITLES = [
  "Direktur Utama", "Komisaris", "Manajer Penjualan", "Kepala Cabang",
  "Staf Pemasaran", "Direktur Operasional", "Wakil Direktur",
  "Account Executive", "General Manager", "Kepala Divisi",
];
const SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];
const OWNERS = ["Andi Hidayat", "Rina Permata", "Teguh Saputra", "Maya Kusuma"];
const PRODUCTS = [
  "Paket Growth 12 bln", "Lisensi Enterprise", "Modul WhatsApp API",
  "Add-on Field Sales", "Paket Starter", "Integrasi Tokopedia",
  "Pelatihan Tim Sales", "Modul Compliance", "Paket Custom",
];
const ECOM_PRODUCTS = [
  "Kemeja Batik Pria", "Sepatu Sneakers Lokal", "Tas Kulit Asli",
  "Kopi Gayo 500g", "Madu Hutan 1L", "Skincare Set", "Hijab Premium",
  "Power Bank 20000mAh", "Botol Tumbler", "Snack Box Lebaran",
];
const AVATAR = [
  "#0D9488", "#6366F1", "#E1306C", "#F59E0B", "#3B82F6", "#8B5CF6",
  "#EF4444", "#10B981", "#0EA5E9", "#EC4899", "#14B8A6", "#F97316",
];
const MSG_CHANNELS = ["whatsapp", "email", "instagram", "linkedin", "sms"] as const;
const CONSENT = ["consented", "pending", "none"] as const;
const STAGES = ["prospek", "kualifikasi", "penawaran", "negosiasi", "tutup"] as const;

const pick = <T,>(arr: readonly T[]): T => faker.helpers.arrayElement(arr);
const color = () => pick(AVATAR);
const id = (p: string, n: number) => `${p}_${String(n).padStart(4, "0")}`;
const isoPast = (days: number) =>
  faker.date.between({ from: new Date(NOW.getTime() - days * 864e5), to: NOW }).toISOString();
const isoFuture = (days: number) =>
  faker.date.between({ from: NOW, to: new Date(NOW.getTime() + days * 864e5) }).toISOString();
const fullName = () => `${pick(FIRST)} ${pick(LAST)}`;
const write = (file: string, data: unknown) => {
  writeFileSync(path.join(OUT, file), JSON.stringify(data, null, 2));
  const n = Array.isArray(data) ? data.length : Object.keys(data as object).length;
  console.log(`  ${file.padEnd(22)} ${n}`);
};

// ---- companies --------------------------------------------------------------
const companies = Array.from({ length: 80 }, (_, i) => {
  const name =
    i < REAL_COMPANIES.length
      ? REAL_COMPANIES[i]
      : `${pick(COMPANY_PREFIX)} ${pick(COMPANY_WORDS)} ${pick(COMPANY_WORDS)}`;
  return {
    id: id("co", i + 1),
    name,
    industry: pick(INDUSTRIES),
    city: pick(CITIES),
    size: pick(SIZES),
  };
});

// ---- contacts ---------------------------------------------------------------
const contacts = Array.from({ length: 500 }, (_, i) => {
  const co = pick(companies);
  const name = fullName();
  return {
    id: id("ct", i + 1),
    name,
    title: pick(TITLES),
    companyId: co.id,
    company: co.name,
    industry: co.industry,
    city: co.city,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@${co.name
      .replace(/^(PT|CV|UD|Koperasi)\s+/i, "")
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .slice(0, 12) || "mail"}.co.id`,
    phone: `+62 8${faker.string.numeric(2)}-${faker.string.numeric(4)}-${faker.string.numeric(4)}`,
    channelPreference: pick(MSG_CHANNELS),
    consent: faker.helpers.weightedArrayElement([
      { value: "consented" as const, weight: 6 },
      { value: "pending" as const, weight: 3 },
      { value: "none" as const, weight: 1 },
    ]),
    consentSource: pick(["Event Arsa Tower", "Form website", "WA opt-in", "Webinar", "Pameran UMKM"]),
    consentDate: isoPast(180),
    lastActivity: isoPast(30),
    avatarColor: color(),
    tags: faker.helpers.arrayElements(
      ["hot-lead", "enterprise", "umkm", "referral", "inbound", "event"],
      { min: 0, max: 2 },
    ),
    source: pick(["Event", "Website", "Referral", "Cold outreach", "Marketplace"]),
  };
});

// ---- deals ------------------------------------------------------------------
const stageDist = [
  ...Array(14).fill("prospek"),
  ...Array(12).fill("kualifikasi"),
  ...Array(10).fill("penawaran"),
  ...Array(8).fill("negosiasi"),
  ...Array(6).fill("tutup"),
];
const deals = Array.from({ length: 50 }, (_, i) => {
  const ct = pick(contacts);
  const raw = faker.number.int({ min: 5_000_000, max: 2_000_000_000 });
  const value = Math.round(raw / 500_000) * 500_000;
  return {
    id: id("dl", i + 1),
    name: `${pick(PRODUCTS)} — ${ct.company.replace(/^(PT|CV|UD|Koperasi)\s+/i, "")}`,
    contactId: ct.id,
    contactName: ct.name,
    company: ct.company,
    value,
    stage: stageDist[i] ?? pick(STAGES),
    expectedClose: isoFuture(60),
    sourceChannel: pick([...MSG_CHANNELS, "tokopedia", "shopee"]),
    owner: pick(OWNERS),
    avatarColor: ct.avatarColor,
    createdAt: isoPast(90),
  };
});

// ---- conversations + messages ----------------------------------------------
const WA_IN = [
  "Halo, saya tertarik dengan produknya. Bisa info harga?",
  "Pak, apakah masih ada slot demo minggu ini?",
  "Terima kasih infonya, saya diskusikan dulu dengan tim ya.",
  "Boleh dikirim proposalnya ke email saya?",
  "Untuk paket Growth, ada diskon tahunan tidak?",
  "Oke siap, kita lanjut meeting Selasa jam 10 ya.",
];
const WA_OUT = [
  "Selamat pagi Bapak/Ibu, terima kasih sudah menghubungi kami 🙏",
  "Tentu Pak, untuk paket Growth Rp 449.000/pengguna/bulan. Saya kirim detailnya ya.",
  "Baik, saya jadwalkan demo Kamis pukul 14:00 WIB. Berkenan?",
  "Proposal sudah saya kirim ke email Bapak ya, mohon dicek.",
  "Sama-sama Bu, kabari saya kalau ada pertanyaan lagi.",
];
const EMAIL_IN = [
  "Mohon dikirimkan penawaran resmi untuk 25 pengguna.",
  "Kami butuh fitur integrasi WhatsApp Business API. Apakah tersedia?",
  "Terima kasih, kami akan review internal dan kabari pekan depan.",
];
const EMAIL_OUT = [
  "Terlampir penawaran resmi sesuai kebutuhan tim Bapak. Berlaku 30 hari.",
  "Berikut perbandingan paket beserta estimasi ROI untuk perusahaan Anda.",
];
const IG_IN = ["Min, ini ready stock? 😍", "Harga net berapa kak?", "DM aku detailnya dong"];
const IG_OUT = ["Halo kak! Ready ya, boleh cek katalog di bio 😊", "Untuk harga net aku kirim ya kak"];

const conversations: any[] = [];
const messages: any[] = [];
let msgCounter = 1;
for (let i = 0; i < 30; i++) {
  const ct = pick(contacts);
  const channel = pick(MSG_CHANNELS);
  const convId = id("cv", i + 1);
  const count = faker.number.int({ min: 5, max: 12 });
  const last = new Date(NOW.getTime() - faker.number.int({ min: 1, max: 72 }) * 36e5);
  let lastBody = "";
  for (let m = 0; m < count; m++) {
    const direction = m === count - 1 ? pick(["in", "out"]) : (m % 2 === 0 ? "in" : "out");
    const ts = new Date(last.getTime() - (count - m) * faker.number.int({ min: 5, max: 90 }) * 6e4);
    let body: string;
    let subject: string | undefined;
    if (channel === "email") {
      body = direction === "in" ? pick(EMAIL_IN) : pick(EMAIL_OUT);
      subject = pick(["Penawaran Paket Growth", "Re: Demo produk", "Integrasi WhatsApp API"]);
    } else if (channel === "instagram") {
      body = direction === "in" ? pick(IG_IN) : pick(IG_OUT);
    } else {
      body = direction === "in" ? pick(WA_IN) : pick(WA_OUT);
    }
    lastBody = body;
    messages.push({
      id: id("ms", msgCounter++),
      conversationId: convId,
      direction,
      body,
      timestamp: ts.toISOString(),
      status: direction === "out" ? pick(["sent", "delivered", "read"]) : undefined,
      subject,
      attachmentLabel: channel === "email" && m === count - 2 ? "penawaran-growth.pdf" : undefined,
    });
  }
  conversations.push({
    id: convId,
    contactId: ct.id,
    contactName: ct.name,
    company: ct.company,
    channel,
    lastMessage: lastBody,
    lastTimestamp: last.toISOString(),
    unread: faker.helpers.weightedArrayElement([
      { value: 0, weight: 5 },
      { value: faker.number.int({ min: 1, max: 4 }), weight: 3 },
    ]),
    avatarColor: ct.avatarColor,
    assignedTo: pick(OWNERS),
  });
}
conversations.sort((a, b) => +new Date(b.lastTimestamp) - +new Date(a.lastTimestamp));

// ---- cadences + sequences ---------------------------------------------------
const CADENCE_NAMES = [
  "Onboarding SaaS B2B", "Reaktivasi Lead Dingin", "Follow-up Pameran UMKM",
  "Demo to Close", "Welcome Tokopedia Buyer", "Upsell Enterprise",
  "Nurture Webinar", "Win-back Churn", "Outreach BUMN", "Referral Program",
  "Trial Expiry Reminder", "Festive Promo Lebaran",
];
const STEP_CONTENT: Record<string, string[]> = {
  whatsapp: [
    "Selamat pagi {{nama}}, saya dari Agentic AI Sales. Boleh saya bantu jelaskan bagaimana {{perusahaan}} bisa kelola WhatsApp + email dalam satu inbox?",
    "Halo {{nama}}, mengingatkan untuk demo {{produk}} kita. Berkenan minggu ini?",
  ],
  email: [
    "Subjek: Cara {{perusahaan}} mempercepat closing\n\nHalo {{nama}}, banyak tim sales di Indonesia kehilangan lead karena channel terpisah-pisah...",
    "Subjek: Penawaran khusus {{produk}}\n\nBapak/Ibu {{nama}}, terlampir penawaran yang kami siapkan untuk {{perusahaan}}.",
  ],
  call: ["Telepon {{nama}} untuk konfirmasi kebutuhan dan jadwalkan demo."],
  sms: ["{{nama}}, demo {{produk}} dijadwalkan besok 14:00 WIB. Balas YA untuk konfirmasi."],
  linkedin: ["Connect dengan {{nama}} dan kirim pesan pembuka tentang {{produk}}."],
  instagram: ["Balas DM {{nama}} dan arahkan ke katalog produk."],
};
const cadences = CADENCE_NAMES.map((name, i) => {
  const mix = faker.helpers.arrayElements(
    ["whatsapp", "email", "call", "linkedin", "sms"],
    { min: 2, max: 4 },
  );
  return {
    id: id("cd", i + 1),
    name,
    status: faker.helpers.weightedArrayElement([
      { value: "active" as const, weight: 6 },
      { value: "draft" as const, weight: 2 },
      { value: "paused" as const, weight: 1 },
    ]),
    enrolled: faker.number.int({ min: 8, max: 240 }),
    steps: faker.number.int({ min: 3, max: 6 }),
    replyRate: faker.number.int({ min: 8, max: 47 }),
    channelMix: mix,
    createdAt: isoPast(120),
    owner: pick(OWNERS),
  };
});
const sequences: Record<string, any[]> = {};
for (const cad of cadences) {
  let stepId = 1;
  sequences[cad.id] = Array.from({ length: cad.steps }, (_, s) => {
    const ch = cad.channelMix[s % cad.channelMix.length];
    return {
      id: `${cad.id}_s${stepId++}`,
      channel: ch,
      delayDays: s === 0 ? 0 : faker.number.int({ min: 1, max: 4 }),
      subject: ch === "email" ? "Penawaran untuk {{perusahaan}}" : undefined,
      content: pick(STEP_CONTENT[ch] ?? ["Langkah {{nama}}"]),
    };
  });
}
// default template for /cadences/new
sequences["default"] = [
  { id: "tpl_s1", channel: "whatsapp", delayDays: 0, content: STEP_CONTENT.whatsapp[0] },
  { id: "tpl_s2", channel: "email", delayDays: 2, subject: "Penawaran untuk {{perusahaan}}", content: STEP_CONTENT.email[0] },
  { id: "tpl_s3", channel: "call", delayDays: 3, content: STEP_CONTENT.call[0] },
];

// ---- field reps + visits ----------------------------------------------------
const JKT = { lat: -6.2088, lng: 106.8456 };
const SBY = { lat: -7.2575, lng: 112.7521 };
const jitter = (b: { lat: number; lng: number }) => ({
  lat: b.lat + faker.number.float({ min: -0.06, max: 0.06 }),
  lng: b.lng + faker.number.float({ min: -0.06, max: 0.06 }),
});
// Owner of each field rep (demo user ids from lib/auth/demo-accounts). The first
// two are the Sales Rep's own patch so logging in as "Sales Rep" demonstrates the
// rep→sendiri scope; the rest sit under the Sales Manager's team.
const FIELD_OWNERS = ["u_rep", "u_rep", "u_manager", "u_manager", "u_manager", "u_manager", "u_manager", "u_manager"];
const fieldReps = Array.from({ length: 8 }, (_, i) => {
  const base = i < 5 ? JKT : SBY;
  const city = i < 5 ? "Jakarta" : "Surabaya";
  const pos = jitter(base);
  return {
    id: id("fr", i + 1),
    ownerUserId: FIELD_OWNERS[i],
    name: fullName(),
    status: faker.helpers.weightedArrayElement([
      { value: "kunjungan" as const, weight: 4 },
      { value: "istirahat" as const, weight: 2 },
      { value: "selesai" as const, weight: 2 },
    ]),
    city,
    lat: pos.lat,
    lng: pos.lng,
    visitsToday: faker.number.int({ min: 1, max: 6 }),
    visitsPlanned: 6,
    lastCheckIn: isoPast(1),
    avatarColor: color(),
    route: Array.from({ length: 4 }, (_, r) => ({
      ...jitter(base),
      label: `${pick(["Kunjungan", "Survey", "Closing", "Demo"])} ${r + 1}`,
    })),
  };
});
const visits = Array.from({ length: 40 }, (_, i) => {
  const rep = pick(fieldReps);
  const co = pick(companies);
  return {
    id: id("vs", i + 1),
    repName: rep.name,
    customer: fullName(),
    company: co.name,
    type: pick(["Demo produk", "Survey kebutuhan", "Negosiasi", "Penagihan", "Maintenance"]),
    city: rep.city,
    notes: pick([
      "Klien tertarik paket Growth, minta proposal resmi.",
      "Perlu approval direktur, follow up minggu depan.",
      "Sudah deal, tunggu PO keluar.",
      "Kompetitor menawarkan harga lebih murah, perlu strategi.",
      "Demo lancar, lanjut ke tahap negosiasi.",
    ]),
    followUp: faker.datatype.boolean(),
    timestamp: isoPast(14),
    outcome: pick(["berhasil", "tindak-lanjut", "tidak-ada"]),
  };
});

// ---- orders -----------------------------------------------------------------
const orders = Array.from({ length: 100 }, (_, i) => {
  const abandoned = faker.datatype.boolean({ probability: 0.15 });
  const qty = faker.number.int({ min: 1, max: 5 });
  const unit = faker.number.int({ min: 35_000, max: 850_000 });
  return {
    id: `INV/${pick(["TKP", "SHP", "TTS"])}/${faker.string.numeric(8)}`,
    marketplace: pick(["tokopedia", "shopee", "tiktok"]),
    customer: fullName(),
    product: pick(ECOM_PRODUCTS),
    qty,
    total: qty * unit,
    status: abandoned
      ? "dibatalkan"
      : pick(["diproses", "dikirim", "diterima", "diproses", "dikirim"]),
    date: isoPast(20),
    abandoned,
  };
});

// ---- AI canned responses ----------------------------------------------------
const aiResponses = [
  {
    id: "ai_1",
    triggers: ["cadence email", "buatkan cadence", "cadence b2b", "saas b2b"],
    title: "Cadence Email 5 Langkah — SaaS B2B",
    kind: "cadence",
    body: "Berikut cadence email 5-langkah untuk SaaS B2B:\n\n1. Hari 0 — Email perkenalan + 1 insight industri\n2. Hari 2 — Studi kasus pelanggan sejenis\n3. Hari 5 — Tawaran demo 20 menit\n4. Hari 8 — Email \"break-up\" lembut + value terakhir\n5. Hari 12 — Penawaran trial 14 hari\n\nMau saya isi template-nya dengan {{nama}} & {{perusahaan}}?",
  },
  {
    id: "ai_2",
    triggers: ["analisa pipeline", "analisis pipeline", "pipeline saya"],
    title: "Analisis Pipeline",
    kind: "analysis",
    body: "Pipeline Anda saat ini bernilai Rp 8,4 miliar dengan 50 deal. Insight: 28% nilai menumpuk di tahap Negosiasi >21 hari — risiko stagnan. Rekomendasi: prioritaskan 3 deal Negosiasi bernilai tertinggi minggu ini dan aktifkan cadence \"Demo to Close\". Win-rate WhatsApp Anda 34% lebih tinggi dari email — geser follow-up ke WA.",
  },
  {
    id: "ai_3",
    triggers: ["lead terbaik", "lead minggu ini", "siapa lead", "scoring"],
    title: "5 Lead Terbaik Minggu Ini",
    kind: "scoring",
    body: "Lead skor tertinggi (berdasarkan engagement + kecocokan profil):\n\n1. Budi Santoso — PT Sentosa Jaya (92) — buka email 4×, balas WA\n2. Siti Nurhaliza — Bank Mandiri (88) — minta proposal\n3. Ahmad Wijaya — PT Astra (85) — hadir demo\n4. Putri Indah — CV Mitra Sejahtera (81) — klik harga 3×\n5. Rizki Pratama — Halodoc (79) — referral internal\n\nMau saya tambahkan kelimanya ke cadence \"Demo to Close\"?",
  },
  {
    id: "ai_default",
    triggers: [],
    title: "Asisten Sales",
    kind: "default",
    body: "Saya bisa bantu dengan: pembuatan cadence, analisis pipeline, prospek scoring, dan optimasi pesan. Mau coba?",
  },
];

// ---- consent log ------------------------------------------------------------
const consentLog = Array.from({ length: 50 }, (_, i) => {
  const ct = pick(contacts);
  return {
    id: id("cl", i + 1),
    contactName: ct.name,
    source: pick(["event", "form", "wa-optin"]),
    // Deterministic fields (no faker calls — keeps other files' RNG stable):
    channel: ct.channelPreference,
    ip: `103.${((i * 7) % 200) + 1}.${(i * 13) % 255}.${(i * 29) % 255}`,
    date: isoPast(200),
    version: pick(["v2.1", "v2.0", "v1.9"]),
    status: ct.consent,
  };
});

// ---- content (Konten) -------------------------------------------------------
const CONTENT_TYPES = [
  "wa-broadcast",
  "email-campaign",
  "instagram-post",
  "tokopedia-post",
  "blog",
] as const;

const CONTENT_TEMPLATES: Record<
  (typeof CONTENT_TYPES)[number],
  {
    titles: string[];
    bodies: string[];
    subjects?: string[];
    hashtags?: string[];
    audiences: string[];
  }
> = {
  "wa-broadcast": {
    titles: [
      "Promo Hari Belanja Nasional",
      "Penawaran Spesial Lebaran",
      "Reminder Demo Produk Selasa",
      "Update Fitur Inbox Terpadu",
      "Survei Kepuasan Pelanggan Q2",
      "Pengingat Tagihan Langganan",
      "Flash Sale 24 Jam",
    ],
    bodies: [
      "Halo {{nama}} 🎉 Khusus hari ini, paket Growth diskon 20% untuk {{perusahaan}}. Klaim sebelum 17:00 WIB. Reply YA untuk info detail.",
      "Selamat menyambut Idul Fitri, {{nama}} 🌙 Kami siapkan paket bundling khusus untuk tim sales Anda. Berkenan kami kirimkan proposalnya?",
      "Pak/Bu {{nama}}, mengingatkan demo {{produk}} besok pukul 14:00 WIB. Balas YA untuk konfirmasi 🙏",
      "{{nama}}, fitur Inbox Terpadu kini mendukung Instagram DM 📸 Cek update lengkap di akun Anda. Kabari kami kalau ada pertanyaan.",
    ],
    audiences: ["Pelanggan VIP", "Lead BUMN", "Lead UMKM", "Trial users", "Pelanggan aktif"],
  },
  "email-campaign": {
    titles: [
      "Newsletter Sales Mei 2026",
      "Studi Kasus: PT Sentosa Jaya",
      "Webinar UU PDP untuk BPR",
      "Update Fitur Mei 2026",
      "Welcome Series — Hari 1",
      "Re-engagement Lead Dingin",
    ],
    subjects: [
      "5 tren sales Indonesia yang penting bulan ini",
      "Bagaimana PT Sentosa Jaya menutup 3× lebih banyak deal",
      "Webinar Gratis: Kepatuhan UU PDP untuk BPR",
      "Fitur baru: Cadence multi-channel + AI assist",
      "Selamat datang di Agentic Sales 👋",
    ],
    bodies: [
      "Halo Tim,\n\nBulan Mei ini kami mengumpulkan 5 insight tentang tren sales B2B di Indonesia — mulai dari pergeseran ke WhatsApp-first sampai dampak UU PDP pada outbound. Baca selengkapnya di link berikut.\n\nSalam,\nTim Agentic Sales",
      "Halo {{nama}},\n\nPT Sentosa Jaya menutup 3× lebih banyak deal setelah memakai cadence WhatsApp + email. Berikut ringkasan singkatnya untuk {{perusahaan}}.\n\nKlik untuk baca studi kasus lengkap.",
      "Bapak/Ibu {{nama}},\n\nKami mengundang Anda ke webinar gratis tentang penerapan UU PDP di sektor perbankan, khususnya untuk BPR. Daftar sekarang — kuota terbatas.\n\nTanggal: 12 Juni 2026\nWaktu: 14:00 WIB",
    ],
    audiences: ["Semua pelanggan", "Lead BPR", "Lead BUMN", "Trial users", "Churned customers"],
  },
  "instagram-post": {
    titles: [
      "Tips Sales: 5 Cara Tutup Deal Lebih Cepat",
      "Behind the scenes tim sales",
      "Quote of the day",
      "Spotlight Pelanggan: Halodoc",
      "Tren WhatsApp Business 2026",
      "Survey: Channel favorit tim sales",
    ],
    bodies: [
      "5 Cara Tutup Deal Lebih Cepat (Versi Tim Sales Indonesia 🇮🇩):\n\n1. Balas WA dalam 5 menit\n2. Pakai cadence multi-channel\n3. Selalu catat keberatan\n4. Personalisasi pesan pakai {{nama}}\n5. Follow-up sampai 7×\n\nSimpan post-nya 👇",
      "Hari ini kami spotlight tim sales Halodoc 💚 mereka pakai cadence WhatsApp + email untuk reaktivasi lead — hasilnya: response rate naik 42% dalam 2 minggu. Selamat tim Halodoc!",
      "\"Sales bukan tentang menjual. Sales tentang mendengarkan.\" — Tim Agentic Sales 💬",
    ],
    hashtags: [
      "#salesindonesia",
      "#agenticsales",
      "#salesb2b",
      "#whatsappbusiness",
      "#umkm",
      "#salestips",
      "#salescoaching",
    ],
    audiences: ["Followers IG", "Komunitas sales", "UMKM"],
  },
  "tokopedia-post": {
    titles: [
      "Promo Lebaran: Bundling Hemat",
      "Produk Baru: Skincare Set Premium",
      "Flash Sale 7 Hari",
      "Restock: Kopi Gayo 500g",
    ],
    bodies: [
      "🎉 Promo Lebaran! Bundling 3 produk best-seller cuma Rp 199.000 (hemat 35%). Gratis ongkir Jakarta & Surabaya. Klik beli sekarang sebelum kehabisan!",
      "✨ Produk Baru di toko kami — Skincare Set Premium 5-step. Cocok untuk kulit sensitif, BPOM terdaftar. Cek detail di halaman produk.",
      "🔥 Flash Sale 7 hari! Semua produk diskon 25%, gratis ongkir di Jabodetabek. Stok terbatas, buruan check-out.",
    ],
    audiences: ["Tokopedia followers", "Pelanggan toko"],
  },
  blog: {
    titles: [
      "Cara Memilih Sales Platform untuk UMKM Indonesia",
      "UU PDP No. 27/2022: Yang Harus Tim Sales Ketahui",
      "Studi Kasus: Bank Mandiri & Otomatisasi Cadence",
      "5 Tren Sales Indonesia 2026",
    ],
    bodies: [
      "Memilih sales platform untuk UMKM di Indonesia tidak semudah memilih dari katalog tools global. Konteks lokal — WhatsApp sebagai channel utama, integrasi marketplace, dan kepatuhan UU PDP — sangat berpengaruh pada keputusan ini.\n\nDi artikel ini, kami bahas 6 kriteria yang sering luput dari evaluasi: ...",
      "UU PDP No. 27/2022 mengubah cara tim sales mengelola data pelanggan. Tiga implikasi penting: (1) persetujuan eksplisit untuk outreach, (2) hak akses & hapus data, (3) jejak audit komprehensif.\n\nBerikut checklist 12-poin untuk memastikan tim sales Anda patuh tanpa mengorbankan velocity.",
      "Bank Mandiri menggunakan cadence WhatsApp + email + telepon untuk meningkatkan reaktivasi nasabah dorman. Hasilnya: response rate naik 38% dalam 90 hari. Berikut breakdown setup cadence-nya...",
    ],
    audiences: ["SEO traffic", "Newsletter subscribers", "Komunitas sales"],
  },
};

const CONTENT_CTAS = [
  "Klik untuk daftar",
  "Pelajari selengkapnya",
  "Hubungi tim sales",
  "Beli sekarang",
  "Mulai trial gratis",
  "Baca artikel",
];

const CONTENT_TAGS = [
  "lebaran",
  "promo",
  "edukasi",
  "studi-kasus",
  "umkm",
  "bumn",
  "compliance",
  "feature-launch",
  "reactivation",
];

const TARGET_COUNTS: Record<(typeof CONTENT_TYPES)[number], number> = {
  "wa-broadcast": 8,
  "email-campaign": 7,
  "instagram-post": 8,
  "tokopedia-post": 5,
  blog: 4,
};

let contentSeq = 1;
const content: any[] = [];
for (const type of CONTENT_TYPES) {
  const t = CONTENT_TEMPLATES[type];
  const count = TARGET_COUNTS[type];
  for (let i = 0; i < count; i++) {
    // Status distribution: 25% draft, 12% review, 12% approved, 30% scheduled, 21% published
    const status = faker.helpers.weightedArrayElement([
      { value: "draft" as const, weight: 25 },
      { value: "review" as const, weight: 12 },
      { value: "approved" as const, weight: 12 },
      { value: "scheduled" as const, weight: 30 },
      { value: "published" as const, weight: 21 },
    ]);
    let scheduledFor: string | undefined;
    if (status === "scheduled") {
      // 0..21 days in the future
      scheduledFor = new Date(
        NOW.getTime() + faker.number.int({ min: 1, max: 21 }) * 864e5,
      ).toISOString();
    } else if (status === "published") {
      // 1..21 days in the past
      scheduledFor = new Date(
        NOW.getTime() - faker.number.int({ min: 1, max: 21 }) * 864e5,
      ).toISOString();
    }
    const item: any = {
      id: `cn_${String(contentSeq++).padStart(4, "0")}`,
      title: pick(t.titles),
      type,
      status,
      body: pick(t.bodies),
      audience: pick(t.audiences),
      author: pick(OWNERS),
      createdAt: isoPast(45),
      updatedAt: isoPast(7),
      tags: faker.helpers.arrayElements(CONTENT_TAGS, { min: 1, max: 3 }),
      cta: pick(CONTENT_CTAS),
    };
    if (scheduledFor) item.scheduledFor = scheduledFor;
    if (type === "email-campaign" && t.subjects) item.subject = pick(t.subjects);
    if ((type === "instagram-post" || type === "tokopedia-post") && t.hashtags) {
      item.hashtags = faker.helpers.arrayElements(t.hashtags, { min: 2, max: 5 });
    }
    if (status === "published") {
      item.reach = faker.number.int({ min: 120, max: 18500 });
    }
    content.push(item);
  }
}

// ---- dashboard helpers: tasks + activity ------------------------------------
const tasks = [
  { title: "Follow up Pak Budi via WA", channel: "whatsapp", priority: "tinggi" },
  { title: "Kirim quote ke PT Sentosa Jaya", channel: "email", priority: "tinggi" },
  { title: "Telepon Ibu Siti — konfirmasi demo", channel: "call", priority: "sedang" },
  { title: "Balas DM Instagram @retailmaju", channel: "instagram", priority: "sedang" },
  { title: "Connect LinkedIn Direktur PT Astra", channel: "linkedin", priority: "rendah" },
  { title: "Review proposal Bank Mandiri", channel: "email", priority: "tinggi" },
  { title: "Aktifkan cadence Reaktivasi Lead", channel: "whatsapp", priority: "sedang" },
  { title: "Jadwalkan kunjungan Surabaya", channel: "call", priority: "rendah" },
].map((t, i) => ({
  id: id("tk", i + 1),
  ...t,
  contactName: fullName(),
  due: pick(["Hari ini", "Hari ini", "Besok", "10:00 WIB", "14:30 WIB"]),
  done: false,
}));

const ACTIONS = [
  { action: "membalas pesan", channel: "whatsapp" },
  { action: "memindahkan deal ke Negosiasi", channel: undefined },
  { action: "menambahkan kontak ke cadence", channel: "email" },
  { action: "menerima order baru", channel: "tokopedia" },
  { action: "check-in kunjungan", channel: undefined },
  { action: "menutup deal", channel: undefined },
  { action: "mengirim penawaran", channel: "email" },
  { action: "membalas DM", channel: "instagram" },
];
const activity = Array.from({ length: 10 }, (_, i) => {
  const a = pick(ACTIONS);
  return {
    id: id("ac", i + 1),
    actor: pick(OWNERS),
    action: a.action,
    target: pick([...contacts.slice(0, 50).map((c) => c.name), "PT Sentosa Jaya", "Bank Mandiri"]),
    channel: a.channel,
    timestamp: isoPast(2),
  };
}).sort((x, y) => +new Date(y.timestamp) - +new Date(x.timestamp));

// ---- GRC: DPIA logs ---------------------------------------------------------
const DPIA_PROCESSES = [
  "Kampanye broadcast WhatsApp",
  "Prospecting & enrichment lead",
  "Integrasi marketplace (Tokopedia/Shopee)",
  "Cadence email multi-channel",
  "Sinkronisasi data sales lapangan",
  "Skoring lead berbasis AI",
  "Ekspor data kontak ke CSV",
];
const DPIA_DATACATS = [
  "Data kontak & preferensi channel",
  "Data perilaku & engagement",
  "Data transaksi marketplace",
  "Data lokasi sales lapangan",
  "Data sensitif (none)",
];
const dpia = DPIA_PROCESSES.map((process, i) => {
  const level = faker.helpers.weightedArrayElement([
    { value: "rendah" as const, weight: 4 },
    { value: "sedang" as const, weight: 3 },
    { value: "tinggi" as const, weight: 2 },
  ]);
  return {
    id: id("dpia", i + 1),
    process,
    dataCategory: pick(DPIA_DATACATS),
    riskLevel: level,
    status: faker.helpers.weightedArrayElement([
      { value: "selesai" as const, weight: 5 },
      { value: "berjalan" as const, weight: 2 },
      { value: "perlu-tinjauan" as const, weight: 2 },
    ]),
    owner: pick(["Andi Hidayat (DPO)", "Maya Kusuma (DPO)"]),
    date: isoPast(150),
    mitigations: faker.number.int({ min: 1, max: 6 }),
  };
});

// ---- GRC: vendor risk assessments -------------------------------------------
const VENDORS = [
  { vendor: "Meta WhatsApp BSP", category: "Messaging", residency: "Singapore" },
  { vendor: "AWS (ap-southeast-3)", category: "Hosting", residency: "AWS Jakarta" },
  { vendor: "Tokopedia Open API", category: "Marketplace", residency: "Indonesia" },
  { vendor: "Shopee Open Platform", category: "Marketplace", residency: "Singapore" },
  { vendor: "SendGrid", category: "Email", residency: "United States" },
  { vendor: "Twilio SMS", category: "Messaging", residency: "United States" },
  { vendor: "Mapbox", category: "Analytics", residency: "United States" },
  { vendor: "Midtrans", category: "Payment", residency: "Indonesia" },
];
const vendors = VENDORS.map((v, i) => {
  const score = faker.number.int({ min: 8, max: 78 });
  const level = score < 30 ? "rendah" : score < 55 ? "sedang" : "tinggi";
  return {
    id: id("vnd", i + 1),
    vendor: v.vendor,
    category: v.category,
    riskScore: score,
    riskLevel: level as "rendah" | "sedang" | "tinggi",
    dpaSigned: faker.datatype.boolean({ probability: 0.8 }),
    residency: v.residency,
    lastReview: isoPast(90),
  };
});

// ---- prospecting: discovered leads ------------------------------------------
const TECH_STACK = [
  "WhatsApp Business API", "Mekari Qontak", "HubSpot", "Salesforce", "SAP",
  "Microsoft 365", "Google Workspace", "Accurate", "Jurnal", "Moka POS",
  "Tokopedia Seller", "Shopee Seller",
];
const INTENT_SIGNALS = [
  "Mengunjungi halaman harga 3×", "Mengunduh whitepaper UU PDP",
  "Membuka 2 email kampanye", "Mencari 'sales platform' di Google",
  "Aktif diskusi sales di LinkedIn", "Hadir webinar produk",
  "Menambah headcount tim sales", "Membandingkan vendor CRM",
];
const REVENUE_BAND = [
  "< Rp 5 M/thn", "Rp 5–25 M/thn", "Rp 25–100 M/thn",
  "Rp 100–500 M/thn", "> Rp 500 M/thn",
];
const PROSPECT_SOURCE = [
  "LinkedIn", "Web crawl", "Database B2B", "Event Arsa Tower",
  "Referral mitra", "Direktori industri",
];
const tempFromScore = (s: number): "panas" | "hangat" | "dingin" =>
  s >= 75 ? "panas" : s >= 50 ? "hangat" : "dingin";
const slug = (name: string) =>
  name.replace(/^(PT|CV|UD|Koperasi)\s+/i, "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 12) || "mail";

const prospects = Array.from({ length: 60 }, (_, i) => {
  const co = pick(companies);
  const name = fullName();
  const enriched = faker.datatype.boolean({ probability: 0.45 });
  const score = faker.number.int({ min: 18, max: 97 });
  return {
    id: id("pr", i + 1),
    name,
    title: pick(TITLES),
    company: co.name,
    industry: co.industry,
    city: co.city,
    companySize: co.size,
    revenue: pick(REVENUE_BAND),
    email: enriched ? `${name.toLowerCase().replace(/\s+/g, ".")}@${slug(co.name)}.co.id` : "—",
    emailVerified: enriched,
    phone: enriched ? `+62 8${faker.string.numeric(2)}-${faker.string.numeric(4)}-${faker.string.numeric(4)}` : "—",
    channelPreference: pick(MSG_CHANNELS),
    techStack: enriched ? faker.helpers.arrayElements(TECH_STACK, { min: 1, max: 3 }) : [],
    aiScore: score,
    aiTemp: tempFromScore(score),
    intentSignals: faker.helpers.arrayElements(INTENT_SIGNALS, { min: 1, max: 3 }),
    source: pick(PROSPECT_SOURCE),
    enriched,
    inCrm: false,
    avatarColor: color(),
  };
});

// ---- prospecting: inbound leads ---------------------------------------------
const INBOUND_SOURCES = [
  { source: "website", channel: "email" },
  { source: "form", channel: "email" },
  { source: "whatsapp", channel: "whatsapp" },
  { source: "instagram", channel: "instagram" },
  { source: "marketplace", channel: "tokopedia" },
] as const;
const INBOUND_MSGS = [
  "Halo, saya tertarik dengan paket Growth. Bisa minta penawaran untuk 15 pengguna?",
  "Apakah platform ini terintegrasi dengan WhatsApp Business API resmi?",
  "Kami BPR di Surabaya, butuh solusi yang patuh UU PDP. Bisa demo?",
  "Min, produk ini ready? Boleh tahu harga net-nya?",
  "Mohon info untuk kebutuhan tim sales 50 orang di seluruh cabang.",
  "Saya lihat iklan kalian, bagaimana cara mulai trial?",
];
const SUGGESTED_ACTIONS = [
  "Balas info harga + tawarkan demo 15 menit",
  "Kirim katalog & studi kasus sejenis",
  "Tambahkan ke cadence 'Demo to Close'",
  "Alihkan ke tim Enterprise (deal besar)",
  "Jadwalkan call discovery",
];
const inbound = Array.from({ length: 12 }, (_, i) => {
  const src = pick(INBOUND_SOURCES);
  const co = pick(companies);
  const score = faker.number.int({ min: 35, max: 98 });
  return {
    id: id("in", i + 1),
    name: fullName(),
    company: co.name,
    source: src.source,
    channel: src.channel,
    message: pick(INBOUND_MSGS),
    aiScore: score,
    aiTemp: tempFromScore(score),
    suggestedAction: pick(SUGGESTED_ACTIONS),
    receivedAt: isoPast(3),
    status: "baru",
    avatarColor: color(),
  };
}).sort((a, b) => +new Date(b.receivedAt) - +new Date(a.receivedAt));

// ---- write ------------------------------------------------------------------
console.log("Writing mock data to lib/mock-data/ ...");
write("companies.json", companies);
write("contacts.json", contacts);
write("deals.json", deals);
write("conversations.json", conversations);
write("messages.json", messages);
write("cadences.json", cadences);
write("sequences.json", sequences);
write("field-reps.json", fieldReps);
write("visits.json", visits);
write("orders.json", orders);
write("ai-responses.json", aiResponses);
write("consent-log.json", consentLog);
write("dpia.json", dpia);
write("vendors.json", vendors);
write("prospects.json", prospects);
write("inbound.json", inbound);
write("content.json", content);
write("tasks.json", tasks);
write("activity.json", activity);
console.log(`Done. (${messages.length} messages)`);
