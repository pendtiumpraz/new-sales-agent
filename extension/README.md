# Maira Sales — LinkedIn Collector

Dua cara pakai, sama-sama jalan **di sesi LinkedIn Anda sendiri** (Anda login
sendiri di browser; **tidak ada kredensial yang disimpan**):

1. **Extension Chrome (MV3)** — paling kuat: **RPA 3 tahap** (search → list →
   enrich profil) dengan background orchestration. ← folder ini.
2. **Userscript Tampermonkey** (`maira-userscript.user.js`) — install paling
   gampang (paste ke Tampermonkey); scrape halaman yang sedang dibuka → kirim ke
   app. Cocok kalau tak mau load extension.

> Kenapa RPA & bukan login dari web app: LinkedIn auth-gated. Tool pakai sesi
> login Anda di browser → **tidak perlu login LinkedIn dari aplikasi**.

## A) Extension — 3 tahap (doc 40)

| Tahap | Apa | Hasil |
|---|---|---|
| **1 — Cari** | RPA people-search untuk query jabatan, halaman 1..N | nama + link profil + headline + **PT terbaru** → buffer → `/api/ingest` |
| **2 — Enrich** | kunjungi tiap profil → **detail + track record** (experience, about) + **overlay kontak** | `person.experience` (riwayat karier) + email/HP (jika dibagikan) ter-isi di app |
| Flush | kirim buffer, rate-limited + daily-cap + consent-gated | — |

### Email & nomor HP (overlay kontak)
Saat **Tahap 2**, extension juga membuka `/in/<id>/overlay/contact-info/` dan mengambil
**email / telepon / website** → dikirim sebagai `contactPoint`. **Hanya muncul untuk
koneksi 1st-degree yang membagikan kontaknya**; untuk non-koneksi LinkedIn menyembunyikannya
→ pakai **Hunter.io** atau **crawl website PT** sebagai gantinya. (Userscript: scrape overlay
hanya jika modal "Contact info" sedang dibuka.)

### Hubungkan dulu (connect)
Setelah dipasang, **hubungkan ke app**: di popup isi **URL aplikasi** + **Ingest token**,
lalu klik **"🔌 Hubungkan & tes koneksi"**. Ini ping `/api/extension/heartbeat` → app
menandai **"Terhubung"** di *Pengaturan → Extension*. Extension juga heartbeat tiap 5 menit,
jadi status hidup/mati terdeteksi otomatis.

**Dua lapis deteksi:** (1) **Terpasang di browser ini** — `detect.js` menjawab handshake
`postMessage` dari halaman app (tahu extension ada walau token belum diisi); (2)
**Terhubung** — heartbeat server (bukti token valid + benar kirim ke workspace ini).

### Pasang
1. `chrome://extensions` → **Developer mode** → **Load unpacked** → pilih folder `extension/`.
2. Login ke **linkedin.com** di tab yang sama.
3. Klik ikon extension → isi **URL aplikasi**, **Ingest token** (`LINKEDIN_INGEST_TOKEN`)
   → **"🔌 Hubungkan & tes koneksi"** sampai hijau → isi **Query** jabatan + **maks halaman**.

### Pakai
1. **Tahap 1:** buka 1 tab LinkedIn (login) → **"Mulai cari (Tahap 1)"** (jeda 3–7 dtk/halaman, anti-ban).
2. **Tahap 2:** **"Enrich profil (Tahap 2)"** → kunjungi tiap profil (jeda 4–9 dtk), ambil track record → kirim ke app.
3. **Stop** kapan saja. **Kirim buffer** = flush manual.

### Ekspor CSV
**Ekspor CSV sekarang dari platform (halaman Kontak), bukan dari extension.** Extension hanya
mengirim data hasil crawl ke aplikasi; tak ada file lokal yang ditulis. Tiap batch yang dikirim
diberi label **`channel`** (maps/linkedin/google/…) + **`query`** (kata kunci pencarian) supaya
platform bisa membangun **riwayat discovery**. Unduh CSV dari **Kontak → "Ekspor CSV"** (kolom
sama persis dengan template impor → round-trip).

## Google Maps — cari PT/bisnis B2B (channel Level-1)

Pilih channel **Google Maps (cari PT/bisnis)** → isi query (mis. `distributor kabel Surabaya`)
→ **Cari**. Extension buka tab Maps otomatis, **scroll daftar hasil sampai habis**
(sampai teks *"Anda telah mencapai akhir daftar"* / *"You've reached the end of the list"*,
atau tak ada item baru, atau batas aman ~150), lalu per listing ambil **nama, alamat,
telepon, website**.

- **Batas Google:** Maps membatasi **±120 hasil/query** — itu normal. Untuk lebih banyak,
  sempitkan query per sub-area (kecamatan/kota). *(Auto-tiling belum diimplementasi — TODO.)*
- **HP mobile saja:** nomor yang disimpan hanya HP Indonesia (`^(\+?62|0)8\d{7,11}$`),
  dinormalisasi ke `+62…`. **Landline** (021/022/031/0274/061…) **dibuang**.
- **Email:** tidak ada di Maps → tiap **website** listing otomatis di-crawl (jalur Deep-Enrich:
  `extractContactsInPage` + verifikasi DeepSeek) untuk ambil email/HP → disimpan sebagai
  `contactPoint` **milik perusahaan** (ownerType `company`) **dan** milik kontak B2B (ownerType `person`).
- **Maps → Perusahaan + kontak B2B ke workspace.** Tiap listing dikirim ke `/api/ingest` sebagai
  **`companies[]`** (`source:"maps"`, `capturedMode:"maps"`) **dan** **`people[]`** (nama PT =
  `fullName`, `companyName` sama supaya nyambung ke perusahaan, `leadType:"b2b_client"` →
  `segment:"b2b"` di server, `status:"enriched"`), plus `contactPoints[]` ganda (ownerType
  `company` **dan** `person`) untuk HP mobile + email. Semua ditandai ke workspace yang dipilih,
  jadi listing muncul di tab **Kontak** (filter B2B) workspace, bukan cuma di **Perusahaan**.

> **WIP — tuning selector.** DOM Maps sangat di-obfuscate + sering A/B-test. Selector di
> `scrapeMapsInPage()` (`background.js`) **best-effort** dan kemungkinan perlu disesuaikan
> saat run pertama di Maps live. Status popup menandai ini ("selector mungkin perlu disesuaikan").

## Dikendalikan platform (Fase 3 — DRIVE) + BYOA classify

Selain crawl manual dari popup, extension ini bisa **dikendalikan dari platform/agent**.

**DRIVE — perintah crawl/enrich jarak jauh.** Sebuah agent (API key scope `write`,
Bearer `msk_live_…`) meng-*enqueue* perintah:

```
POST /api/agent/extension/commands
{ "type": "crawl", "params": { "channel": "maps", "query": "PT travel Jakarta", "workspaceId": "ws_…" } }
```

Extension (pakai **ingest token per-rep** yang sama dgn heartbeat — **bukan** API key)
mem-*poll* `GET /api/extension/commands` tiap **±1 menit** (dan tiap heartbeat 5 menit),
meng-*claim* perintah (atomik, `FOR UPDATE SKIP LOCKED`), menjalankan scraper yang cocok
di **browser rep yang login (RPA)**, lalu lapor hasil ke
`POST /api/extension/commands/[id]/result`. Hasil crawl masuk CRM lewat `/api/ingest`
seperti biasa.

- `type:"crawl"` → `params.channel` = `maps|linkedin|google|tokopedia|shopee|instagram|tiktok|duckduckgo|ai` (+ `query`, `workspaceId?`, `limit?`).
- `type:"enrich"` → jalankan Deep-Enrich atas buffer.
- `type:"stop"` → hentikan run berjalan.
- `targetUserId` (opsional) mengarahkan perintah ke **1 rep tertentu**; kosong = rep mana saja di tenant.
- Popup menampilkan **"Perintah dari platform: N"** + tombol **"🛰️ Cek perintah dari platform"**.
- **Syarat:** extension **terpasang + login (RPA)** di browser rep. Kalau tab-nya tak siap, perintah gagal/di-skip (dilaporkan).

**BYOA classify — klasifikasi lead lewat agen tenant.** Heartbeat mengembalikan
`aiMode` (`platform` | `byoa`). Di mode **BYOA**, extension **melewati klasifikasi
DeepSeek di browser** (mengirim lead mentah); server meng-*enqueue* task `classify`
ke **agen milik tenant** (metered, model sendiri) via antrean `agent_task`, lalu
`applyResult` menulis `segment/fitScore/fitReason` ke kontak. Mode **platform**
(default): klasifikasi in-browser + fallback heuristik server **tetap seperti semula**.
Ini juga menutup celah *"DeepSeek langsung tanpa metering"* saat BYOA.

> **WIP.** Wiring poll/dispatch memakai ulang scraper yang ada; alur/selector belum
> diverifikasi tanpa Chrome nyata. Service worker bisa dimatikan Chrome di tengah run
> panjang — perintah bisa tersangkut `claimed` (idempotent saat di-ulang).

## B) Userscript Tampermonkey

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Buka `maira-userscript.user.js` → Tampermonkey nawarin install → **Install**.
3. Di menu Tampermonkey → **"Maira: set config"** → isi URL app + token →
   **"Maira: tes koneksi"** untuk memastikan terhubung.
4. Buka halaman LinkedIn search / profil → klik tombol melayang **"➕ Maira"** →
   data terkirim ke app. (Userscript = per-halaman manual; tak ada RPA otomatis
   multi-halaman seperti extension.)

## Tuning selector (penting)
DOM LinkedIn sering berubah. Kalau hasil kosong, edit selector di `content.js`
(`scrapePeople`/`scrapeProfile`/`scrapeExperience`) atau di userscript. Cek di
DevTools halaman live.

## Etika & risiko
- **Pakai akun sendiri.** Otomasi LinkedIn berisiko batasan/ban → ada jeda +
  daily-cap; posture `aggressive` butuh consent.
- UU PDP: data profesional (jabatan/perusahaan) relatif aman; **jangan** ambil
  ranah pribadi (keluarga). Provenance disimpan (`source`, `linkedin_url`). Server
  dedup by stable id (idempotent).
