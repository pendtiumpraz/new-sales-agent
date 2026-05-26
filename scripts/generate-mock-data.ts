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
  let last = new Date(NOW.getTime() - faker.number.int({ min: 1, max: 72 }) * 36e5);
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
const fieldReps = Array.from({ length: 8 }, (_, i) => {
  const base = i < 5 ? JKT : SBY;
  const city = i < 5 ? "Jakarta" : "Surabaya";
  const pos = jitter(base);
  return {
    id: id("fr", i + 1),
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
    date: isoPast(200),
    version: pick(["v2.1", "v2.0", "v1.9"]),
    status: ct.consent,
  };
});

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
write("tasks.json", tasks);
write("activity.json", activity);
console.log(`Done. (${messages.length} messages)`);
