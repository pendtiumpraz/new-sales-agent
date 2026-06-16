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

### Pasang
1. `chrome://extensions` → **Developer mode** → **Load unpacked** → pilih folder `extension/`.
2. Login ke **linkedin.com** di tab yang sama.
3. Klik ikon extension → isi **URL aplikasi**, **Ingest token** (`LINKEDIN_INGEST_TOKEN`)
   → **"🔌 Hubungkan & tes koneksi"** sampai hijau → isi **Query** jabatan + **maks halaman**.

### Pakai
1. **Tahap 1:** buka 1 tab LinkedIn (login) → **"Mulai cari (Tahap 1)"** (jeda 3–7 dtk/halaman, anti-ban).
2. **Tahap 2:** **"Enrich profil (Tahap 2)"** → kunjungi tiap profil (jeda 4–9 dtk), ambil track record → kirim ke app.
3. **Stop** kapan saja. **Kirim buffer** = flush manual.

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
