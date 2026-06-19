# Wireframe 07 — Workspace · Tim · Marketplace · Panduan

Cakupan: Workspaces (+hub), Monitoring Sales, Marketplace, Panduan, Use-case. Mengikuti `00-redesign-system.md`.

| Halaman | Route | Template |
|---|---|---|
| Workspaces | `/workspaces` | B · Card grid |
| Hub workspace | `/workspaces/[id]` | D · Detail |
| Monitoring Sales | `/team` | B · Roster |
| Marketplace | `/marketplace` | B/E · Browse + bundle builder |
| Panduan | `/documentation` | reader |
| Use Case | `/use-case` | reader + jump-nav |

---

### Workspaces — `/workspaces` · Template: B (card grid)
**Tujuan:** "container fokus jualan" per produk/tujuan; pilih untuk men-scope seluruh app.
**Aksi utama:** **+ Buat workspace**.
**Masalah sekarang:** konsep workspace abstrak; user tak paham efek scope; kartu kurang menjelaskan "apa yang masuk".

```
┌ Workspace                                                          [+ Buat workspace ▸] ┐
│ Pilih workspace untuk memfokuskan kontak, cadence, deal & laporan ke satu tujuan.        │
│ 🔎 cari…   [Tipe ▾][Status ▾]                                                            │
│ ┌ kartu ───────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐         │
│ │ ◧ Ekspor Manufaktur      │ │ ◧ Retensi B2C        │ │ + Buat workspace baru │         │
│ │ produk · segmen          │ │ …                    │ └──────────────────────┘         │
│ │ 38 lead · 4 cadence      │ │                      │                                   │
│ │ owner · [Buka & fokus ▸] │ │                      │                                   │
│ └──────────────────────────┘ └──────────────────────┘                                    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** kartu menjelaskan isi (produk, segmen, #lead, #cadence, owner); "Buka & fokus" → set scope aktif + chip TopBar berubah; subjudul menjelaskan efek scope.
**States:** empty → "Belum ada workspace — Buat yang pertama"; loading → skeleton kartu; error → retry.
**Mobile:** kartu 1 kolom.

---

### Hub workspace — `/workspaces/[id]` · Template: D
**Tujuan:** ringkasan satu workspace + lead-nya; kelola.
**Aksi utama:** **Tambah lead** (dari Profil/Discovery) — sekunder: Edit, Arsipkan.
**Masalah sekarang:** lead list dulu nama+jabatan tanpa perusahaan (sudah → "jabatan · perusahaan"); leadCount termasuk soft-deleted (sudah difilter).

```
┌ ‹ Workspace / Ekspor Manufaktur                  [Edit]  [Arsipkan]  [Tambah lead ▸]  ┐
│ Tipe: lead_gen · Produk: Paket Growth · Segmen: Korporat · Owner: Galih · 38 lead     │
├ Lead di workspace ini ─────────────────────────────┬ Samping ──────────────────────────┤
│ Budi Santoso · CMO · PT Astra            [B2B]      │ Cadence ter-scope: 4              │
│ Sari · Dir Ops · PT Sinar                [B2B]      │ Deal: Rp 1,2 M                    │
│ …                                                   │ Konten / penawaran ter-scope      │
└──────────────────────────────────────────────────────┴──────────────────────────────────┘
```
**Perubahan kunci:** lead tampil **perusahaan** (qualifier B2B); soft-deleted dibuang; panel samping ringkas relasi ter-scope; flow "Tambah lead" jelas (dari Profil/Discovery, bukan buntu).
**States:** empty lead → "Belum ada lead — Tambah dari Profil / Mulai Discovery"; loading → skeleton; 404 → "Workspace tak ditemukan ‹".
**Mobile:** ringkasan → lead list → samping (tumpuk).

---

### Monitoring Sales — `/team` · Template: B (roster) · [manager]
**Tujuan:** manajer pantau tim: lead, deal/closing, aktivitas AI, aktif/idle.
**Aksi utama:** (read-only) — sekunder: Export.
**Masalah sekarang:** tanpa DB roster kosong "Rp 0" (sudah → seed fallback); atribusi by nama free-text (perlu by ownerUserId).

```
┌ Monitoring Sales                                                          [Export]     ┐
│ ┌Total lead┐ ┌Closing┐ ┌Nilai closing┐ ┌Rep aktif┐   ← agregat tim                     │
│ └──────────┘ └───────┘ └─────────────┘ └─────────┘                                       │
│ 🔎 cari rep…   [Status ▾: aktif/idle]   ↕ lead                                           │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│ │ Rep            Peran    Lead   Deal  Won  Nilai      AI    Aktif terakhir          │   │
│ │ Andi Hidayat   Manager  42     12    5    Rp 320jt   18    37 mnt lalu  ● aktif     │   │
│ │ …                                                                                  │   │
│ └──────────────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** roster selalu terisi (seed fallback); KPI tim di atas; status aktif/idle chip; klik rep → drawer detail. (Atribusi by ownerUserId = backlog.)
**States:** empty → seed roster (demo); loading → skeleton; error → retry.
**Mobile:** kartu per rep (nama + peran + closing + status).

---

### Marketplace — `/marketplace` · Template: B (browse) + E (bundle builder)
**Tujuan:** jual-beli **data PERUSAHAAN** antar-tenant (orang tak dijual); bikin bundle.
**Aksi utama:** **Publikasikan bundle** (tab Publikasi) / **Akuisisi** (tab Jelajah).
**Masalah sekarang:** dulu orang ikut terjual & publish tanpa consent — sudah: orang unsellable, hanya company; bundle builder dengan filter bidang + multi-bundle + 2 mode harga.

```
┌ Marketplace Data                                            [ Jelajah | Publikasikan ]  ┐
│ JELAJAH:  🔎 cari…  [Bidang ▾][Lokasi ▾]                                                 │
│ ┌ kartu bundle/perusahaan ──────────────────────────────────────────────────────────┐  │
│ │ ▣ Bundle "Manufaktur Jatim" · 50 perusahaan · Rp 2,5 jt   [Detail] [Akuisisi]      │  │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│ PUBLIKASIKAN (bundle builder):                                                           │
│ Filter bidang [▾] → [☑ Pilih semua]  pilih 50/100/… perusahaan                           │
│ Nama bundle [__]  Mode harga: ( ) per-bundle  ( ) per-perusahaan   Harga [__]            │
│                                                          [Publikasikan bundle ▸]         │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** dua tab jelas (Jelajah/Publikasi); orang **tak muncul** sama sekali; builder bundle: filter bidang + pilih-semua + nama + mode harga; ikon bundle (Boxes) konsisten.
**States:** empty jelajah → "Belum ada listing"; publish-0 → "Pilih minimal 1 perusahaan"; loading → skeleton; error → retry.
**Mobile:** tab → kartu 1 kolom; builder form penuh-lebar.

---

### Panduan — `/documentation` · Template: reader
**Tujuan:** cara pakai tiap fitur, langkah demi langkah.
**Aksi utama:** (baca) — sekunder: cari.
```
┌ Panduan                                                            🔎 cari topik…       ┐
├ Daftar isi (kiri) ──────────────┬ Konten (kanan) ────────────────────────────────────┤
│ • Mulai cepat                    │ ## Menjalankan cadence                              │
│ • Cadence ▸                      │ 1. …  2. …                                          │
│ • Autopilot                      │ (banner ke Use Case)                                │
└──────────────────────────────────┴──────────────────────────────────────────────────────┘
```
**Perubahan kunci:** layout reader (ToC kiri + konten) konsisten; pencarian topik; tiap topik link ke fitur terkait.
**States:** loading → skeleton; empty cari → "Topik tak ditemukan".
**Mobile:** ToC jadi dropdown atas.

---

### Use Case — `/use-case` · Template: reader + jump-nav
**Tujuan:** skenario sales/marketing per industri (50 industri, 133 skenario).
**Aksi utama:** (baca/cari) — jump per industri.
```
┌ Use Case per industri                                       🔎 cari industri/skenario…  ┐
│ Chips: [Perhotelan][HR][BUMN][Syariah][Healthtech]… (jump-nav, sticky)                   │
│ ## Perhotelan                                                                            │
│ ┌ skenario ── target · cara · hasil · tag ───────────────────────────────────────────┐  │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│ (pola 4-langkah header tetap)                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** jump-nav chips sticky (navigasi 50 industri cepat); pencarian; kartu skenario seragam (target/cara/hasil/tag).
**States:** empty cari → "Tak ada skenario cocok"; loading → skeleton.
**Mobile:** chips scroll-x sticky; kartu 1 kolom.
