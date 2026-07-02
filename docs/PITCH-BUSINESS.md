# Maira Sales — Business Pitch Deck

> **Format:** slide-oriented markdown. Setiap `## Slide N — Judul` = satu slide, siap presentasi.
> **Bahasa:** Indonesia (primer). Nada: bisnis / investor-ready.
> **Sumber angka:** tier & kuota diambil langsung dari `lib/billing/plans.ts`; fitur dari `docs/FEATURES.md`.
> **Terakhir diperbarui:** 2026-07-02. Angka pasar berlabel *estimasi* — bukan presisi palsu.

---

## Slide 1 — Judul & The Ask

# Maira Sales
### Agentic Sales AI — closing di WhatsApp, otomatis tapi manusiawi

**Tagline:** *"AI yang tidak sekadar membalas cepat — tapi menjual dengan cara konsultatif, sampai closing."*

Platform penjualan agentik **WhatsApp-first** untuk **UMKM & tim sales B2B Indonesia**: dari menemukan lead → CRM → percakapan yang menjual → penawaran → closing → retensi, dalam satu alur.

**The Ask:**
> Kami menggalang **[seed round — nominal placeholder, mis. USD 500K–750K]** untuk memindahkan transport WhatsApp ke **WA Cloud API** (jalur aman/skala), mempertajam mesin Closing-Flow AI, dan menembus **10 vertikal UMKM** prioritas di Indonesia dalam 12–18 bulan.

*Demo-first: seluruh produk bisa ditelusuri hari ini. SaaS multi-tenant sungguhan sudah berjalan di belakangnya (Postgres + RBAC + billing).*

---

## Slide 2 — Masalah

### Realita penjualan di Indonesia: WhatsApp-driven, tapi manual dan bocor

- **WhatsApp adalah kanal jual-beli utama**, bukan sekadar chat. Tapi dikelola manual dari HP masing-masing sales — tidak terukur, tidak terekam.
- **Tidak ada disiplin follow-up.** Lead menghangat lalu didiamkan. Riset industri konsisten menyebut mayoritas prospek butuh **beberapa kali follow-up**, sementara kebanyakan sales berhenti setelah 1–2 kali. Lead hilang bukan karena harga — karena lupa ditindaklanjuti.
- **Balas cepat ≠ menjual.** Tool "WA blast" & auto-reply hanya menyemprot pesan; tidak menggali kebutuhan, tidak menahan harga sampai nilai tersampaikan, tidak tahu kapan waktunya closing.
- **Tidak ada penyaringan product-fit.** Sales membakar waktu ke prospek yang tidak akan pernah beli, karena tidak ada filter B2C/B2B + skor kecocokan.
- **Data lead berserakan.** Kontak di HP, di spreadsheet, di DM — tidak ada CRM yang jadi satu sumber kebenaran, apalagi atribusi per-sales.
- **Owner UMKM tidak punya waktu** untuk melatih tim soal teknik closing, menulis skrip, atau mengaudit percakapan.

> **Intinya:** kanal-nya benar (WhatsApp), tapi eksekusinya manual, tidak disiplin, dan tidak cerdas. Pipeline bocor di setiap sambungan.

---

## Slide 3 — Solusi

### AI yang menjual secara konsultatif di WhatsApp — value-first, sampai closing

Maira menjalankan **satu alur utuh**: `crawl → CRM → percakapan yang menjual → closing → retensi`.

- **Consultative, value-first selling.** Mesin **Closing-Flow AI** menjalankan state-machine percakapan: `rapport → discovery → value → objection → closing`. **Harga ditahan (price-gate)** sampai kebutuhan & nilai tersampaikan — persis cara sales terbaik bekerja.
- **1 workspace = 1 produk.** Setiap produk punya *market-fit* (B2B/B2C/mix + ICP), *sales-play* (tone, kanal, teknik), dan *knowledge base* sendiri. AI menjual dalam konteks satu produk, bukan generik.
- **17 teknik closing** (metodologi Dewa Eka Prayoga) tertanam; teknik agresif (kelangkaan, harga-coret) otomatis **hanya untuk B2C**, tidak pernah dipakai ke B2B.
- **Humanizer.** Satu balasan AI dipecah jadi beberapa "bubble" pendek dengan jeda mengetik — terasa seperti manusia, bukan bot.
- **Guardrail & handoff.** Komplain / negosiasi / topik sensitif / kredit habis → **diserahkan ke manusia**, tidak pernah menampilkan error atau "token habis".
- **Mode aman.** Bisa **auto** (AI membalas) atau **semi** (AI menyiapkan draft, sales approve dulu).

> Bukan chatbot yang cepat. Ini **sales rep AI yang metodis** — konsisten menjalankan cara jualan yang benar di setiap percakapan.

---

## Slide 4 — Product Overview

### Satu platform, satu alur — dalam bahasa bisnis

| Kapabilitas | Apa yang dilakukan (bahasa bisnis) |
|---|---|
| **Discovery & Enrichment** | Temukan lead lintas kanal (LinkedIn, Google Maps, marketplace, IG/FB) → satu graf Perusahaan→Orang. Enrich → auto-klasifikasi B2C/B2B + skor kecocokan → dorong ke CRM. |
| **AI CRM (Kontak & Lead)** | Semua kontak tersegmentasi B2C/B2B, riwayat deal/aktivitas, skor fit + alasan AI, klasifikasi industri & pekerjaan. |
| **Pipeline / Deals** | Kanban deal per tahap, sinyal "hot lead" otomatis dari skor kecocokan. |
| **Inbox + Cadence + Autopilot** | Inbox WA/email tergabung; **cadence** (urutan follow-up otomatis lintas kanal); **autopilot** orkestrasi AI atas percakapan. |
| **Penawaran / Closing** | AI menyusun item + email cover; kirim; **link publik** melacak "dilihat / diterima". Terkunci setelah dikirim. |
| **Retensi & Win-back** | Alur retensi/win-back/loyalty otomatis; recovery keranjang belanja e-commerce satu-klik via WA. |
| **Data Marketplace** | Loop pendapatan kedua — jual-beli data perusahaan antar-tenant (mesin backend). |
| **Sales Lapangan (Field)** | Kunjungan lapangan dengan check-in/out ber-geo-stamp. |
| **Laporan & Analitik** | Dashboard agregat real-time: funnel closing, deal per tahap, kontak per segmen, aktivitas lapangan. |

> **Catatan kejujuran:** sebagian permukaan masih demo-grade / WIP (scraper per-kanal, lifecycle autopilot, data-trading UI). Mesin inti — Closing-Flow AI + transport WA + CRM rebuild — sudah **Live end-to-end**.

---

## Slide 5 — Why Now

### Tiga kurva bertemu di titik yang tepat

1. **WhatsApp ubiquitous di Indonesia.** WA adalah antarmuka default untuk dagang — dari warung sampai B2B. Volume percakapan komersial masif, tapi belum ada "otak" yang mengelolanya secara metodis.
2. **Biaya LLM anjlok.** Model seperti kelas DeepSeek membuat percakapan penjualan cerdas jadi **ekonomis per-token**. Yang dulu mahal per percakapan, kini viable untuk UMKM. Arsitektur metered + BYOK kami mengunci margin ini.
3. **UMKM sedang digitalisasi.** Gelombang go-digital + literasi tool SaaS meningkat; owner mencari alat yang **langsung menghasilkan penjualan**, bukan sekadar administrasi.

> Kanal sudah matang, biaya AI sudah turun, pasar sudah siap membayar. Jendela ini terbuka sekarang.

---

## Slide 6 — Market (TAM / SAM / SOM)

### Ukuran pasar — estimasi berlabel, bukan presisi palsu

> *Semua angka di bawah adalah **estimasi kerangka** untuk skala keputusan, bukan riset pasar tervalidasi.*

- **TAM (Total Addressable Market)** — **±64 juta UMKM di Indonesia** + tim sales B2B. Bila diambil segmen digital-ready yang berjualan via WhatsApp/online dan mampu membayar SaaS, ini adalah pasar puluhan juta usaha. *(Order-of-magnitude: puluhan triliun rupiah/tahun untuk tooling sales & CRM.)*
- **SAM (Serviceable Available Market)** — UMKM & tim B2B yang **aktif berjualan via WhatsApp, punya >1 sales, dan bersedia bayar tool berlangganan**. Estimasi kerangka: **~2–4 juta usaha**. Pada ARPU blended ~Rp300–500k/bln → *ordo triliunan rupiah/tahun*.
- **SOM (Serviceable Obtainable Market — 3 tahun)** — target realistis penetrasi awal via self-serve + vertikal prioritas: **~10.000–30.000 tenant berbayar**. Pada ARPU ~Rp350k/bln → **ordo Rp40–125 miliar ARR**.

**Cara kami menghitung (transparan):** `pasar = jumlah usaha target × % yang berlangganan × ARPU`. Kami memilih rentang, bukan satu angka, agar keputusan tahan terhadap ketidakpastian.

---

## Slide 7 — Business Model

### SaaS berlapis + BYOK + top-up + marketplace data (dua loop pendapatan)

**Loop pendapatan #1 — Langganan SaaS** (dari `lib/billing/plans.ts`):

| Tier | Harga/bln | Untuk siapa |
|---|---|---|
| **Free** | Rp0 | Coba-coba / solo, 1 seat |
| **Starter** | Rp149.000 | Usaha kecil, 3 seat |
| **Growth** | Rp499.000 | Tim tumbuh, 10 seat |
| **Enterprise** | Rp1.999.000 | Tim besar, 50 seat |
| **Unlimited** | (internal/kustom) | Tanpa batas metrik |

**Pengungkit pendapatan tambahan:**
- **BYOK (Bring Your Own Key).** Tenant pakai kunci AI sendiri → token AI **tidak dihitung ke kuota** (tetap dimeter untuk analitik, tidak ditagih). Ini menurunkan hambatan adopsi tenant besar sekaligus melindungi margin kami.
- **Top-up quota packs (7 paket, semua 30 hari).** Pesan +1k/+5k, token AI +1M/+5M, kontak +5k, perusahaan +2k, seat +5. Paket **menaikkan batas bulanan**, bukan cap harian → upsell natural tanpa churn.
- **Payment rails siap Indonesia:** **Midtrans terpasang penuh** (Snap + webhook terverifikasi); Stripe untuk langganan; Xendit/Tripay scaffolded.

**Loop pendapatan #2 — Inter-tenant Data Marketplace.** Data perusahaan yang di-crawl/enrich bisa **diperjualbelikan antar-tenant** (browse/acquire/bundle/publish). Menciptakan **efek jaringan**: makin banyak tenant meng-crawl, makin bernilai marketplace-nya — dan itu jadi aliran pendapatan yang tidak bergantung pada langganan. *(Mesin backend Live; UI konsumen masih WIP.)*

---

## Slide 8 — Business Model Canvas

### Sembilan blok

| Blok | Isi |
|---|---|
| **1. Key Partners** | Penyedia LLM (DeepSeek/Anthropic/OpenAI/Google via adapter), penyedia WhatsApp (WA Cloud API untuk skala), payment gateway (Midtrans/Stripe/Xendit/Tripay), penyedia data/enrichment, komunitas & konsultan UMKM/reseller vertikal. |
| **2. Key Activities** | Pengembangan mesin Closing-Flow AI, hardening transport WA, onboarding tenant, kurasi 17 teknik closing + KB per-vertikal, kepatuhan UU PDP, operasi multi-tenant. |
| **3. Key Resources** | Codebase modular-monolith (Next.js 14 + Postgres multi-tenant + RBAC), mesin percakapan + humanizer, katalog teknik closing, extension Chrome collector, tim engineering/sales-ops. |
| **4. Value Propositions** | Menjual secara konsultatif di WA sampai closing; 1 workspace = 1 produk; price-gate + product-fit filtering; atribusi per-sales; lokal Bahasa Indonesia; biaya AI terkendali (metered + BYOK); demo-first, aktivasi bertahap. |
| **5. Customer Relationships** | Self-serve (free → upgrade), superadmin-provisioned untuk enterprise, white-label per-user, support + KB, handoff-to-human bawaan. |
| **6. Channels** | Self-serve web signup, provisioning superadmin, extension Chrome (distribusi via reps), reseller/konsultan vertikal, konten Bahasa Indonesia. |
| **7. Customer Segments** | UMKM dagang (B2C) berbasis WA, tim sales B2B, agensi/reseller, 15 vertikal (properti, otomotif, F&B, edukasi, kesehatan, dll). |
| **8. Cost Structure** | Token LLM (variabel — ditekan BYOK), infra Postgres/hosting, pengembangan, akuisisi (sales/marketing), kepatuhan & keamanan, dukungan. |
| **9. Revenue Streams** | Langganan berlapis (Starter→Enterprise), top-up packs, marketplace data antar-tenant, potensi lisensi white-label / kustom Unlimited. |

---

## Slide 9 — SWOT

### Kekuatan · Kelemahan · Peluang · Ancaman

**Strengths**
- **WA-native** — dibangun untuk kanal jual-beli utama Indonesia.
- **Ter-lokalisasi Indonesia** — Bahasa Indonesia default, 17 teknik closing lokal, rail pembayaran lokal (Midtrans).
- **Closing-Flow AI** — bukan auto-reply; state-machine + price-gate + product-fit + guardrail/handoff.
- **Multi-tenant sungguhan** — Postgres + RBAC + RLS + audit + soft-delete, siap SaaS.
- **BYOK** — margin AI terlindung; hambatan adopsi tenant besar turun.

**Weaknesses**
- **Zona abu-abu ToS WhatsApp** — kedua transport (WAHA + extension) adalah otomasi WA Web dan **melanggar ToS WhatsApp**; risiko ban ke nomor pribadi sales.
- **Area demo-grade / WIP** — scraper per-kanal, lifecycle autopilot, UI data-trading, klasifikasi (heuristik, belum semua LLM), split data legacy/rebuild.
- **Belum ada test suite** — kualitas dijaga manual (tsc/lint), belum otomatis.

**Opportunities**
- **WA Cloud API** — jalur resmi/skala yang menghilangkan risiko ban → membuka segmen enterprise yang risk-averse.
- **Data marketplace** — loop pendapatan kedua + efek jaringan.
- **Vertikalisasi** — 15 vertikal dengan KB + sales-play + teknik closing khusus (produk per-vertikal, harga premium).

**Threats**
- **ToS/ban platform** — WhatsApp (update Jan 2026 melarang chatbot AI pihak-ketiga), LinkedIn/IG scraping.
- **Kompetitor** — WA blast tools, CRM generik, dan pemain yang bergerak ke WA Cloud API lebih dulu.
- **Ketergantungan penyedia LLM** — perubahan harga/kebijakan/akses (dimitigasi arsitektur multi-provider + BYOK).

---

## Slide 10 — Go-To-Market

### Dua motion, satu bahasa

- **Self-serve (bottom-up).** Free tier → aktivasi cepat via extension → upgrade saat kuota/seat mentok. Product-led growth untuk UMKM.
- **Superadmin-provisioned (top-down).** Konsol superadmin memprovisioning tenant + admin pertama dalam satu klik — untuk enterprise, agensi, dan deal reseller. Aktivasi ber-durasi + kuota token.
- **Vertikal dulu, baru lebar.** Menang di beberapa vertikal (mis. properti, otomotif, edukasi, F&B) dengan KB + sales-play + teknik closing siap-pakai → referensi & studi kasus → ekspansi.
- **Bahasa-first.** Seluruh pengalaman Bahasa Indonesia default (English toggle) — cocok dengan owner & sales lokal, bukan produk terjemahan.
- **Distribusi lewat reps & reseller.** Extension per-rep + atribusi mendorong adopsi organik dalam tim; konsultan/agensi jadi kanal reseller.

---

## Slide 11 — Competition / Differentiation

### Kenapa Maira, bukan yang lain

| | WA blast / auto-reply tools | CRM generik | **Maira Sales** |
|---|---|---|---|
| Kanal WhatsApp native | ✅ (blast) | ⚠️ add-on | ✅ **brain server-side + transport agnostik** |
| Menjual konsultatif (bukan blast) | ❌ | ❌ | ✅ **state-machine value-first + price-gate** |
| Product-fit filtering (B2C/B2B + skor) | ❌ | ⚠️ manual | ✅ **market-fit + auto-klasifikasi** |
| Teknik closing tertanam | ❌ | ❌ | ✅ **17 teknik, difilter per market** |
| Atribusi per-sales (RPA) | ❌ | ⚠️ | ✅ **token per-rep, execution per akun rep** |
| Lokal Indonesia (bahasa + payment) | ⚠️ | ⚠️ | ✅ **Bahasa default + Midtrans** |
| Guardrail + handoff-to-human | ❌ | ❌ | ✅ **bawaan** |

> **Positioning:** "WA blast" menyemprot; CRM generik mencatat. **Maira benar-benar menjual** — konsultatif, sesuai product-fit, dengan atribusi per-rep. Filosofi arsitektur: **RPA mengekstrak/profil; AI merekomendasi + memfilter fit; eksekusi & atribusi per akun sales individu.**

---

## Slide 12 — Traction / Roadmap

### Kondisi build saat ini + jalan ke depan

**Sudah Live (end-to-end):**
- Mesin **Closing-Flow AI** (stage-machine, 17 teknik, humanizer, market-fit analyzer, predictive readiness heuristik + kalibrasi empiris).
- **Transport WhatsApp** (WAHA server-gateway + extension Chrome), reply-only + allowlist + rate-limit + mode auto/semi.
- **CRM rebuild** (kontak/perusahaan/deal/pipeline), Inbox, Cadence, Penawaran (quote-to-cash + link publik), Retensi, E-Commerce, Field, Reports — semua rebuild-DB, tenant-scoped, soft-delete + audit.
- **Multi-tenant SaaS**: RBAC, kuota/subscription (5 plan + 7 top-up pack), billing (Midtrans terpasang), BYOK, konsol Superadmin.
- **Extension collector v0.14.0** (multi-channel + CSV + Deep Enrich + sinkronisasi kuota).

**WIP (jujur):** scraper per-kanal (IG/FB/marketplace/TikTok), lifecycle autopilot (baru mencatat), UI data-trading, split data legacy/rebuild pada Dashboard & Map, sebagian tab settings.

**Roadmap — BYOA (Bring Your Own Agent/Account):**
1. **WA Cloud API** — jalur resmi/skala, hilangkan risiko ban → buka enterprise. *(prioritas dana)*
2. **Data marketplace UI** — aktifkan loop pendapatan kedua penuh.
3. **Vertikalisasi** — paket per-vertikal (KB + sales-play + teknik).
4. **Autopilot lifecycle penuh** + ML readiness (naik dari heuristik ke model terlatih).
5. **Kualitas** — test suite otomatis, penyatuan data legacy→rebuild.

---

## Slide 13 — Pricing Table

### Kuota per tier (langsung dari `lib/billing/plans.ts`)

| Metrik | Free | Starter | Growth | Enterprise | Unlimited |
|---|---|---|---|---|---|
| **Harga/bln** | Rp0 | Rp149.000 | Rp499.000 | Rp1.999.000 | — (kustom) |
| **Seat (anggota tim)** | 1 | 3 | 10 | 50 | ∞ |
| **Kontak** | 100 | 1.000 | 10.000 | 100.000 | ∞ |
| **Perusahaan** | 50 | 500 | 5.000 | 50.000 | ∞ |
| **Pesan / bln** | 200 | 2.000 | 20.000 | 200.000 | ∞ |
| **Token AI / bln** | 50.000 | 500.000 | 5.000.000 | 50.000.000 | ∞ |
| **Cap harian — pesan** | 20 | 150 | 1.500 | 15.000 | ∞ |
| **Cap harian — token AI** | 5.000 | 40.000 | 400.000 | 4.000.000 | ∞ |

**Aturan penting:**
- **Bulanan reset:** pesan + token AI reset tiap bulan (`YYYY-MM`); seat/kontak/perusahaan adalah akumulator seumur-hidup.
- **Cap harian** berlaku **di atas** batas bulanan — anggaran sebulan tidak bisa dibakar dalam sehari.
- **Top-up packs** menaikkan batas **bulanan**, bukan cap harian.
- **BYOK** → token AI tidak dihitung ke kuota (tetap dimeter untuk analitik).
- **Fail-open:** plan tak dikenal/kosong → unlimited, jadi tenant lama tidak pernah tiba-tiba terblokir.

---

## Slide 14 — Team / Ask / Use of Funds

### Tim, permintaan, dan penggunaan dana

**Team** *(placeholder — isi profil sebenarnya):*
- **Founder / Product & Engineering** — membangun codebase end-to-end (Next.js 14, Postgres multi-tenant, Vercel AI SDK). Solo founder, full-stack.
- **[Hire prioritas: Sales/Growth lead — GTM vertikal & reseller]**
- **[Hire prioritas: AI/Backend engineer — WA Cloud API + ML readiness]**
- **Advisors** — [placeholder: domain UMKM / sales-methodology / legal PDP].

**The Ask:** **[Seed — USD 500K–750K, placeholder]**

**Use of Funds (indikatif):**
| Alokasi | % | Untuk apa |
|---|---|---|
| Product & Engineering | ~40% | WA Cloud API, data-marketplace UI, autopilot lifecycle, test suite |
| Go-To-Market | ~30% | Vertikalisasi, reseller, konten Bahasa, akuisisi self-serve |
| AI & Infra | ~15% | Token LLM (di-hedge BYOK), Postgres/hosting, keamanan |
| Compliance & Legal | ~10% | UU PDP No. 27/2022, jalur ToS WA yang aman |
| Buffer | ~5% | Kontingensi |

**Milestone 12–18 bulan:** WA Cloud API produksi · 10 vertikal · **[10K–30K tenant berbayar]** · marketplace data aktif.

---

## Appendix — Catatan Kejujuran (WhatsApp ToS)

> Disampaikan terbuka ke investor — bukan disembunyikan.

- Kedua transport saat ini (**WAHA** dan **extension Chrome**) adalah **otomasi WhatsApp Web** dan **melanggar ToS WhatsApp** (update Jan 2026 melarang chatbot AI pihak-ketiga). Risiko ban menimpa **nomor pribadi sales**.
- **Mitigasi yang sudah server-enforced:** reply-only + allowlist (tidak pernah cold-message), pacing manusiawi (humanizer), volume rendah (rate-limit per-lead/jam + per-tenant/hari), dan mode **semi-auto** (draft → approve). Extension **tidak 24/7** (hanya saat Chrome + tab WA Web terbuka).
- **Jalur skala yang aman = WhatsApp Cloud API** (resmi). Ini adalah **prioritas #1 penggunaan dana** dan pembeda menuju enterprise.
- Scraping LinkedIn/IG juga melanggar terms platform → sengaja dijaga **manual + volume rendah**.
- **"Uplift 30–50%" bukan garansi** — platform menegakkan metodologi yang konsisten; angka akhir = PMF × kualitas lead × harga.

---

*Deck ini dibuat dari kode & katalog fitur aktual (`docs/FEATURES.md`, `lib/billing/plans.ts`, `CLAUDE.md`), bukan aspirasi. Status Live vs WIP ditandai jujur di sepanjang slide.*
