# Wireframe 02 — Lead & Kontak

Cakupan: Kontak, Profil (perusahaan/orang), Discovery, Peta, Profil-kontak. Mengikuti `00-redesign-system.md`.

**Keputusan IA utama:** keempat tujuan nav (Kontak, Profil, Discovery, Peta) dilebur jadi **satu halaman "Kontak & Lead" dengan tab**. Mengurangi 4 item sidebar → 1, dan user paham semuanya soal data lead yang sama.

| Halaman | Route | Template |
|---|---|---|
| Kontak & Lead (shell) | `/contacts` | B · List + tab |
| ↳ Profil | `/contacts/profiles` | B · List (split) |
| ↳ Discovery | `/contacts/discovery` | B · List + progress |
| ↳ Peta | `/contacts/map` | G · Map/visual |
| Profil kontak | `/workspace/[contactId]` | D · Detail |

---

### Kontak & Lead (shell) — `/contacts` · Template: B + tab
**Tujuan:** satu rumah untuk semua data lead; pilih kontak → enroll cadence / kirim pesan.
**Aksi utama:** **+ Tambah kontak** (manual) — sekunder: Import.
**Masalah sekarang:**
- Tab "Kontak / Penemuan / Profil" tersebar; badge hitung beda sumber; seleksi bertahan lintas filter (bulk bar bohong).
- KPI "enrollment cadence" double-count.

```
┌ Kontak & Lead                                      [Import]  [+ Tambah kontak] ┐
│ [ Kontak ] [ Profil ] [ Discovery ] [ Peta ]   ← tab dalam-halaman             │
├────────────────────────────────────────────────────────────────────────────────┤
│ 🔎 cari nama/perusahaan…   [Consent ▾][Channel ▾][Tag ▾]   ↕ updated  [⛁ Arsip] │
│ ┌──────────────────────────────────────────────────────────────────────────────┐│
│ │ ☐ Nama ▾           Perusahaan      Channel  Consent   Aktivitas   ⋯           ││
│ │ ☐ Budi Santoso     PT Astra        WA       opt-in    2 hr        [▸]         ││
│ │ ☐ …                                                                          ││
│ └──────────────────────────────────────────────────────────────────────────────┘│
│ ◀ 1 2 3 … ▶                                                                      │
└────────────────────────────────────────────────────────────────────────────────┘
  ▼ saat ada centang → BULK BAR menggantikan toolbar:
┌ 3 dipilih ·  [Kirim Email/WA]  [Ke cadence]  [Export CSV]  [Arsipkan]   Batal ─┐
```
**Perubahan kunci:**
- 4 nav → 1 halaman + tab; badge tab = jumlah baris **yang tampil** (scoped), bukan dataset penuh.
- Bulk bar muncul saat seleksi; **seleksi di-clear saat ganti filter/halaman** (tak ada "20 dipilih" palsu).
- Klik baris → drawer detail kanan (quick view) tanpa pindah halaman.
**States:** empty → "Belum ada kontak — Tambah / Import / mulai Discovery"; loading → skeleton tabel; error → retry.
**Mobile:** tab → daftar baris ringkas (nama+perusahaan+chip); aksi via swipe/drawer.

---

### Profil — `/contacts/profiles` · Template: B (split)
**Tujuan:** kelola profil **Perusahaan** & **Orang** hasil crawl; enrich; tag ke workspace.
**Aksi utama:** **Enrich terpilih** (atau "+ ke workspace").
**Masalah sekarang:**
- Tab Perusahaan vs Orang dulu kecampur antar-workspace (sudah discope); badge count campur (sudah).
- Aksi "+ workspace" dijanjikan banner tapi kontrolnya hilang (sudah ditambah); bulk enrich tak ada antrian (sudah → queue).

```
┌ Profil                                            [Klasifikasi semua] [Enrich ▸] ┐
│ [ Perusahaan (42) ] [ Orang (318) ]   ← badge = SCOPED count                     │
│ 🔎 cari…  [Bidang ▾][Provinsi ▾][Lead type ▾]   ↕ updated terbaru   [⛁ Arsip]   │
├ Daftar ───────────────────────────────┬ Detail (drawer/panel) ──────────────────┤
│ ☐ PT Sinar Mas  · Manufaktur · Jkt    │ PT Sinar Mas                            │
│   3 kontak · skor 82      [+ ws] [▸]   │ email · web · 12 orang · ringkasan AI   │
│ ☐ …                                    │ [Enrich] [+ workspace] [Jadikan kontak] │
└────────────────────────────────────────┴──────────────────────────────────────────┘
  bulk: [N dipilih · Enrich (antrian) · + workspace · Arsipkan · Batal]
```
**Perubahan kunci:** split list/detail; enrich **bulk antrian** dengan progress; "+ workspace" per-baris jelas; updated-at default urut; badge scoped.
**States:** empty → "Belum ada profil — mulai Discovery"; loading → skeleton; enrich-running → baris progress; error → retry.
**Mobile:** list → detail full-screen.

---

### Discovery — `/contacts/discovery` · Template: B + progress
**Tujuan:** crawl/temukan lead baru (per perusahaan/segmen) → masuk Profil.
**Aksi utama:** **Mulai pencarian**.
**Masalah sekarang:** progress crawl & hasil tidak jelas kapan selesai; badge "penemuan" dari store client beda dengan DB.

```
┌ Discovery lead                                                  [Mulai pencarian ▸] ┐
│ Kriteria: [Industri ▾][Lokasi ▾][Kata kunci ____]   Workspace: Ekspor              │
├──────────────────────────────────────────────────────────────────────────────────┤
│ ▣ Berjalan: scrape 12/40 sumber · 86 orang ditemukan        [Jeda] [Hentikan]      │
│ ┌ Hasil ──────────────────────────────────────────────────────────────────────┐  │
│ │ ☐ Nama · perusahaan · sumber · skor          [Simpan ke Profil] [Buang]       │  │
│ └──────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** progress bar eksplisit (sumber X/Y, jumlah ditemukan); hasil bisa simpan/buang per baris; badge ditarik dari DB yang sama dengan Profil.
**States:** idle → form kriteria + contoh; running → progress; done → "86 lead, simpan semua?"; error → "sumber X gagal, lanjut".
**Mobile:** form → progress → hasil (tumpuk).

---

### Peta — `/contacts/map` · Template: G
**Tujuan:** sebaran lead per provinsi; saring per sumber/tipe/bidang.
**Aksi utama:** (visual) — sekunder: Ekspor.
**Masalah sekarang:** label "X orang" tak masukkan tanpa-provinsi (sudah → "terpetakan"); filter tak per-rep/workspace dulu (sudah).

```
┌ Peta sebaran lead                                  [Sumber ▾][Tipe ▾][Bidang ▾]    ┐
├ Peta Indonesia (besar) ─────────────────────────┬ Ranking provinsi ─────────────────┤
│   ● Jakarta (120)   ● Surabaya (64)             │ 350 orang terpetakan · 12 provinsi │
│   ● … (gradasi kepadatan)                       │ · 40 tanpa lokasi                 │
│                                                  │ 1 Jakarta 120  2 Surabaya 64 …    │
└──────────────────────────────────────────────────┴───────────────────────────────────┘
```
**Perubahan kunci:** label jujur "terpetakan" + "tanpa lokasi"; seleksi provinsi sinkron ke daftar; scope per-rep/workspace.
**States:** empty → "Belum ada lead berlokasi"; loading → peta skeleton; error → retry.
**Mobile:** peta atas (tinggi tetap) + daftar provinsi scroll bawah.

---

### Profil kontak — `/workspace/[contactId]` · Template: D
**Tujuan:** satu kontak: identitas, riwayat percakapan, deal, aktivitas, aksi.
**Aksi utama:** **Kirim pesan** (atau "Ke cadence").
**Masalah sekarang:** halaman padat; relasi (deal/percakapan) tercampur tanpa hierarki; aksi tersebar.

```
┌ ‹ Kontak  /  Budi Santoso                         [Ke cadence]  [Kirim pesan ▸] ┐
│ ◯ Budi Santoso · CMO PT Astra · WA · opt-in · skor 82                           │
├ [ Ringkasan ] [ Percakapan ] [ Deal ] [ Aktivitas ] ────────────────────────────┤
│ ┌ Profil & enrichment ──────────────┐ ┌ Samping: deal terkait, cadence aktif, ─┐ │
│ │ email · hp · linkedin · ringkasan │ │ tugas, consent log                     │ │
│ └────────────────────────────────────┘ └────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** header status + 1 primary; konten bertab (ringkasan/percakapan/deal/aktivitas); relasi di panel samping; breadcrumb kembali.
**States:** loading → skeleton header+tab; not-found → "Kontak tidak ditemukan ‹ kembali"; error → retry.
**Mobile:** header → tab → konten full-width.
