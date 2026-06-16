# Doc 40 — Roadmap & Backlog (sumber kebenaran)

Konsolidasi seluruh visi + status. Update tiap ada kemajuan. Pendamping
`IMPLEMENTATION-PLAN.md`; detail crawl/profiling di doc 39, extension di
`extension/README.md`.

Legenda: ✅ selesai · 🟡 sebagian · 🔜 berikutnya · 💡 ide

---

## 1. Visi (1 kalimat)
Platform sales-intelligence multi-tenant: **crawl** prospek (web + LinkedIn/IG via
extension RPA + Hunter), **profil** mendalam (FORD + track record + sapaan yang
sopan), **petakan** (B2C-customer vs B2B-partner, peta Indonesia), lalu **jangkau**
24 jam (email/WA, cadence, auto-reply, upsell+close) — semua **data real**.

---

## 2. Sudah jalan ✅
- **Multi-tenant + RBAC + superadmin** (kill-switch, kredit AI, **aktivasi
  tenant + valid-until**, register/landing).
- **AI registry** multi-provider, 1 model aktif/tenant, BYOK, metering token+biaya
  (DeepSeek V4 flash/pro masuk katalog). Semua titik AI **metered + grounded**.
- **Crawl website REAL** (email/telp/sosmed dari URL) + **Hunter.io** (orang per
  domain). Validasi email **MX DNS** (13.357 valid dari 13.449).
- **Extension RPA 3-tahap** (search → list → enrich track record) + **userscript
  Tampermonkey** + **halaman download/install** (`/settings/extension`).
  Tangkap **current company** + **tanggal crawl**.
- **Profiling**: salutation engine (Pak/Bu/Mas/Mbak/**Prof./Dr.**/Kak, hierarki
  akademik > konteks-sosmed > nama > Kak) + **empati** di SEMUA pesan; FORD
  synthesis (grounded, Family dikosongkan demi PDP).
- **Engagement**: mailbox (SMTP/OAuth/ESP) + **WhatsApp WAHA** + cadence
  multi-channel + **auto-reply + escalation** (queue 1-klik) + **upsell + closing
  Stripe** + Inngest cron 24 jam.
- **Compliance** (DSAR/audit/retention), **billing** (Stripe), **onboarding
  checklist**, **UX** (sidebar grup, empty-state, label ID, kualitas kontak).

---

## 3. Backlog — berikutnya (prioritas)

### 🔜 A. Email & HP dari LinkedIn (overlay)
Extension Tahap 2.x: buka `/in/<id>/overlay/contact-info/` → scrape email/HP/
website (hanya untuk **koneksi 1st-degree** yang membagikan). Non-koneksi →
Hunter/web. Simpan sebagai `contact_point` (ownerType person).

### 🔜 B. Classifier B2C-customer vs B2B-partner
AI metered: input {jabatan, company, industri, track record, produk tenant} →
`person.lead_type` (`b2c_customer | b2b_partner | unknown`) + alasan + skor.
Feed ke sales (kenapa relevan). Kolom `lead_type` **sudah ada**.

### 🔜 C. Stale warning + re-crawl (>1 tahun)
`captured_at` sudah direkam. UI: badge **"data >1 thn, perlu re-crawl"** di
Profil; Tahap 2 prioritaskan profil stale. Endpoint daftar stale untuk extension.

### 🔜 D. Lokasi → Peta Indonesia + filter
Ambil **kota** (sudah: `location`/`city`) → derive **provinsi** → agregasi jumlah
orang/perusahaan per provinsi → tampil di peta (Leaflet, halaman Sales Lapangan).
Filter: **perusahaan / orang / bidang keahlian** + **sumber (import vs crawl)**.

### 🔜 E. Pisahkan kontak import vs crawl
Filter di halaman Kontak berdasar `source` (Excel import vs crawl:web vs
linkedin-extension vs hunter). Badge sumber per baris.

### 🔜 F. Kejelasan CRM
CRM **sudah ada** tapi terpencar: **Kontak** (database kontak), **Enrichment/
Pipeline** (deal kanban), **Inbox** (percakapan), **Cadence** (outreach). Aksi:
beri label "CRM" yang jelas / hub tunggal + relasi kontak↔deal↔percakapan.

### 💡 G. Instagram adapter
RPA IG untuk **profiling minat/recreation** + gaya bahasa (cara dipanggil di
komen) — bukan kontak (IG minim email/HP).

### 💡 H. Alamat PT (Google Places)
Discovery industri/auto + alamat/telepon PT via Places API (butuh key) →
nyambung ke peta.

### 💡 I. Discovery via AI web search
Tab bidang/auto → AI cari kandidat company (grounded, diverifikasi crawl).

---

## 4. Skema yang sudah/akan
- `person`: + linkedin_url, about, **experience** (track record), gender,
  honorific, age_band, interests, ford, **lead_type**, profile_summary,
  profile_confidence, captured_at. ✅ applied.
- Berikutnya: index provinsi (derive saat query), tak perlu kolom baru besar.

---

## 5. Rencana build multi-agent
Karena fitur B/C/D/E menyentuh file berbeda, aman diparalelkan:
- Agent 1 → **Email/HP overlay** (extension content/background + ingest contactPoints).
- Agent 2 → **Classifier B2C/B2B** (`lib/engagement/classify.ts` + route + wire UI).
- Agent 3 → **Stale warning + re-crawl** (Profil UI + endpoint stale).
- Agent 4 → **Peta + filter + import/crawl split** (Sales Lapangan + Kontak UI).
Schema bersama dikerjakan dulu (sudah), lalu fan-out; tiap agent verifikasi
(tsc+lint) sendiri.

---

## 6. Prinsip (jangan dilanggar)
- **No dummy** — semua data real (Postgres + AI + crawl). Mock hanya fallback.
- **Grounded AI** — jangan ngarang; profiling dari data nyata, Family tak diambil.
- **Sopan + empati** — sapaan benar (Pak/Bu/Mas/Mbak/Prof./Dr.), bukan robot.
- **PDP/ToS** — posture + consent + provenance; akun LinkedIn sendiri, rate-limit.
