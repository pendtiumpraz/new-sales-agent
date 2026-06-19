# Maira Sales — UX Re-Wireframe: Master Design System

> Status: **wireframe / spec only** (no code yet). This is the foundation every
> per-page wireframe in `docs/wireframes/` follows. Read this first.

---

## 1. Diagnosis — kenapa sekarang terasa "gak user-friendly"

Bukan satu halaman jelek — ini **pola sistemik** yang berulang di 42 halaman:

1. **Navigasi terlalu lebar & datar.** 18+ item top-level di sidebar + 11 sub-Pengaturan + 2 tombol melayang (Autopilot coral, Asisten biru). Tidak ada hierarki tugas → user bingung "mulai dari mana". (Hick's law: makin banyak pilihan setara, makin lambat keputusan.)
2. **Tidak ada SATU aksi utama per halaman.** Tiap layar penuh KPI + tabel + 4–6 tombol setara berbobot sama. Mata tidak tahu ke mana. Primary action sering tersembunyi di antara tombol sekunder.
3. **Header tidak konsisten.** Judul + deskripsi panjang, tombol tersebar kiri/kanan, kadang di header kadang di toolbar. Tiap halaman "beda dialek".
4. **Tabel padat tanpa hierarki.** Banyak kolom, tipografi seragam (semua abu-abu sama berat), angka tak rata-kanan, tak ada kolom-kunci yang menonjol → sulit di-scan.
5. **State kosong/loading/error seadanya.** Banyak layar kosong tanpa arahan. User berhenti karena tak tahu langkah berikutnya.
6. **Konsep Workspace tersembunyi.** Scope diam-diam dari switcher di pojok; user tak paham kenapa angka berubah / data "hilang".
7. **Filter & bulk action beda posisi** antar halaman (kadang atas, kadang inline, kadang sebagai tombol terpisah).
8. **Warna & gradien berlebih.** Coral, biru-gradient, amber, badge warna-warni di mana-mana → noise visual, fokus pecah. Aksen kehilangan makna karena dipakai untuk segalanya.
9. **Mobile rapuh.** Sidebar hilang jadi sheet; banyak tabel lebar tak responsif (scroll horizontal).
10. **Flow buntu** (sebagian sudah diperbaiki di logic-audit): aksi yang tak menuntun ke langkah berikutnya ("Simpan filter" yang tak mendaftarkan siapa pun, dll).

**Akar tunggal:** tidak ada **bahasa layout bersama**. Tiap halaman didesain sendiri-sendiri. Perbaikannya bukan mempercantik per layar — tapi menetapkan **satu sistem** lalu menerapkannya konsisten.

---

## 2. Prinsip desain (aturan yang DITAATI tiap halaman)

1. **Satu tujuan, satu aksi utama.** Tiap halaman punya 1 primary button (kanan-atas, warna aksen). Sisanya sekunder/ghost.
2. **Progressive disclosure.** Ringkas dulu, detail saat diminta (drawer/expand), jangan tumpahkan semua sekaligus.
3. **Konsistensi > kreativitas.** Pola yang sama persis di semua halaman (header, toolbar, tabel, empty state).
4. **Selalu ada "langkah berikutnya".** Tidak ada layar buntu. Empty state = ajakan aksi.
5. **Scan-ability.** Hierarki tipografi jelas, whitespace cukup, grouping logis, angka rata-kanan + tabular.
6. **Hemat warna.** Netral sebagai dasar, **1 aksen (coral)** hanya untuk primary action, warna semantik (hijau/amber/merah) HANYA untuk status. Stop gradien dekoratif.
7. **Mobile = list → detail.** Tabel jadi kartu/baris ringkas; detail buka halaman/drawer penuh.
8. **Jujur** (lanjutan audit). Angka & label = data sebenarnya; tak ada delta/skor palsu.

---

## 3. Informasi Arsitektur (IA) — nav baru

**Sekarang:** 6 grup, ~18 item, + Autopilot + Asisten + Pengaturan(11). Terlalu banyak permukaan setara.

**Usulan:** kurangi ke **5 seksi berorientasi-tugas** + konteks workspace + Command Palette (⌘K) untuk "lompat ke mana saja". Sidebar jadi peta mental alur sales: **Cari → Jangkau → Closing → Pantau → Atur.**

```
BERANDA            Dashboard

LEAD               Kontak & Lead         (gabung: kontak, profil, discovery, peta)
                   Riset Prospek         (pipeline enrichment + positioning AI)
                   Marketplace Data      [manager]

JANGKAU            Inbox
                   Cadence
                   Autopilot             ← jadi item nav normal + badge "AI", bukan tombol misterius melayang
                   Eskalasi AI
                   Konten

CLOSING            Pipeline (Deal)
                   Penawaran
                   Retensi
                   E-Commerce

PANTAU             Monitoring Sales      [manager]
                   Sales Lapangan
                   Laporan

  ── footer ──
                   Asisten AI (⌘J)       ← dock bawah, konsisten
                   Panduan · Use Case · Pengaturan
```

Aturan IA:
- **Maks 2 level** di sidebar. Sub-halaman (profil, peta, discovery) jadi **tab di dalam** halaman induk (Kontak & Lead), bukan item nav terpisah.
- **Command Palette ⌘K**: cari kontak/perusahaan/deal + "lompat ke halaman" + aksi cepat ("buat penawaran", "jalankan cadence"). Mengganti tombol Search yang sekarang cuma ke /contacts.
- **Workspace** dapat label eksplisit di TopBar: chip "Workspace: <nama> ▾ · X scope aktif" supaya user sadar konteks. Bukan switcher diam di pojok.
- **Pengaturan** = halaman tunggal dengan **sub-nav kiri** (Akun, Tim, Mailbox, AI & Model, Billing, Kepatuhan, Extension, KB, Handoff, Diagnostics), bukan 11 tujuan nav.
- **Manager-only** item diberi penanda dan disembunyikan dari Rep (sudah ada).

---

## 4. Tata letak global (page shell)

Setiap halaman dibangun dari region yang sama, urutan tetap:

```
┌─ TOPBAR ───────────────────────────────────────────────────────────────────┐
│ ⌘K Cari…            [Workspace: Ekspor ▾]        🔔   Autopilot   ◯ Profil   │
├─ SIDEBAR ─────────┬─ PAGE ──────────────────────────────────────────────────┤
│ Beranda           │ ┌ PAGE HEADER ───────────────────────────────────────┐ │
│ ── LEAD ──        │ │ Breadcrumb (jika nested)                            │ │
│ Kontak & Lead   ▸ │ │ H1 Judul            [Sekunder] [Sekunder] [PRIMARY] │ │
│ Riset Prospek     │ │ subjudul 1 baris (opsional)                         │ │
│ ── JANGKAU ──     │ └─────────────────────────────────────────────────────┘ │
│ Inbox             │ ┌ TOOLBAR ────────────────────────────────────────────┐ │
│ Cadence           │ │ 🔎 cari…   [Filter ▾][Filter ▾]   ↕ urut   ⊞☰ view  │ │
│ Autopilot ✦       │ └─────────────────────────────────────────────────────┘ │
│ …                 │ ┌ CONTENT ────────────────────────────────────────────┐ │
│                   │ │ (kartu / tabel / split / kanban)                    │ │
│                   │ └─────────────────────────────────────────────────────┘ │
│ ── footer ──      │                                                          │
│ ✦ Asisten AI      │                                                          │
└───────────────────┴──────────────────────────────────────────────────────────┘
```

Aturan tiap region:
- **PageHeader:** H1 kiri; aksi kanan = **maks 1 primary + 2 sekunder** (sisanya masuk menu "⋯"). Subjudul ≤ 1 baris. Breadcrumb hanya saat nested.
- **Toolbar:** search **selalu kiri**; filter di tengah (chip dropdown); view-toggle/urut kanan. Saat ada baris terpilih, toolbar **berubah jadi Bulk Bar** ("N dipilih · [aksi] [aksi] · Batal").
- **Content:** satu pola dominan per halaman (jangan campur 3 paradigma). KPI strip (jika ada) **maks 4 tile**, di atas konten, bukan menggantikannya.
- **Density:** mode nyaman default; toggle "rapat" untuk power user di tabel besar.

---

## 5. Komponen & pola yang dipakai ulang

| Pola | Aturan |
|---|---|
| **PageHeader** | H1 + subjudul + (≤1 primary, ≤2 sekunder, sisanya ⋯). Tidak ada tombol di kiri. |
| **Toolbar / Bulk Bar** | Search kiri · filter chip · view/urut kanan. Terpilih → bulk bar menggantikan toolbar. |
| **DataTable** | Header sticky; kolom-kunci **bold**, sekunder muted; angka **rata-kanan + tabular-nums**; status = chip semantik; aksi baris muncul saat hover; pagination bawah; klik baris → drawer detail. |
| **Card grid** | Untuk entitas visual (workspace, cadence, flow, produk). Kartu = ikon/avatar + judul + 2–3 metrik + 1 aksi. |
| **KPI strip** | Maks 4. label kecil + angka besar + konteks 1 baris (mis. "bulan ini"). **Tanpa delta palsu.** |
| **Split view** | List kiri (sempit) + detail kanan. Untuk Inbox, Profil, Penawaran. Mobile → list dulu, detail full-screen. |
| **Detail drawer** | Slide kanan untuk quick-view tanpa pindah halaman (kontak, deal, baris tabel). |
| **Empty state** | Ikon + 1 kalimat "apa ini" + **1 primary action** + link belajar. Tidak pernah layar kosong. |
| **Loading** | Skeleton yang **meniru layout** akhir (bukan spinner tengah). |
| **Error** | Pesan jelas + tombol "Coba lagi" + jalur alternatif. |
| **Wizard/Builder** | Stepper atas / nav kiri; preview kanan; **bar simpan sticky** bawah; status "tersimpan/belum". |
| **Command Palette ⌘K** | Cari entitas + lompat halaman + aksi cepat. |
| **Confirm destruktif** | Dialog dengan nama objek + konsekuensi; soft-delete → "diarsipkan, bisa dipulihkan". |

---

## 6. Template per tipe halaman

- **A · Overview/Dashboard** — KPI strip (≤4) → 1–2 widget prioritas (tugas hari ini, funnel) → daftar ringkas. Tiap widget punya "lihat semua".
- **B · List + Filter (+ bulk)** — Header(primary "Tambah") → Toolbar → DataTable → pagination. Baris klik → drawer.
- **C · Split list/detail** — List kiri + detail kanan (Inbox, Profil).
- **D · Detail/record** — Header(breadcrumb + status chip + primary) → ringkasan atas → tab konten → aktivitas/relasi samping.
- **E · Builder/Wizard** — Stepper → form kiri + preview kanan → save bar sticky.
- **F · Settings** — Sub-nav kiri + section form kanan; tiap section punya "Simpan" sendiri.
- **G · Map/Visual** — Peta/visual besar kiri + panel daftar/filter kanan; sinkron seleksi.

---

## 7. Format wireframe per-halaman (DIPATUHI semua dokumen cluster)

Tiap halaman ditulis dengan blok ini:

```
### <Nama Halaman> — `/route`   ·   Template: <A–G>
**Tujuan:** untuk siapa, menyelesaikan apa.
**Aksi utama:** <1 primary>.
**Masalah sekarang:** 2–4 bullet (spesifik, yang bikin tidak user-friendly).

[ ASCII wireframe layout baru ]

**Perubahan kunci:** bullet (apa yang berubah & kenapa lebih baik).
**States:** empty / loading / error (1 baris masing-masing).
**Mobile:** 1 baris.
```

Contoh terisi (jadi acuan gaya) — lihat `01-*.md` dst.

---

## 8. Sistem visual (ringkas)

- **Warna:** netral (latar/teks) + **1 aksen coral** khusus primary action. Semantik: hijau=sukses, amber=perhatian, merah=bahaya. Hapus gradien dekoratif; badge pakai warna semantik saja.
- **Tipografi:** skala jelas — H1 (judul), H2 (section), body, caption. Angka selalu `tabular-nums`.
- **Spacing & radius:** grid 4px; radius konsisten (sm kontrol, lg kartu); padding kartu 16–20.
- **Density:** nyaman default; opsi rapat di tabel.
- **Ikon:** satu set (lucide), ukuran konsisten, makna konsisten (jangan Sparkles untuk segala hal).
- **Aksesibilitas:** kontras AA, target sentuh ≥40px, fokus terlihat, label pada semua kontrol.

---

## 9. Cara baca dokumen cluster

| Dok | Cakupan |
|---|---|
| `01-home-reports.md` | Dashboard, Laporan, Asisten AI |
| `02-leads-contacts.md` | Kontak & Lead, Profil, Discovery, Peta, Workspace kontak |
| `03-pipeline-quotes.md` | Riset Prospek (Pipeline), Penawaran (+detail), Prospecting |
| `04-cadences-autopilot.md` | Cadence (+new, +detail), Autopilot |
| `05-inbox-escalations.md` | Inbox (+thread), Eskalasi |
| `06-retention-ecom-content-field.md` | Retensi (+flow), E-commerce, Konten, Field (+visits) |
| `07-workspaces-team-marketplace-docs.md` | Workspaces (+hub), Monitoring Sales, Marketplace, Panduan, Use-case |
| `08-settings.md` | Pengaturan + semua sub-halaman (AI, Billing, Kepatuhan, DSAR, Diagnostics, Extension, Handoff, KB, Mailbox, Tim) |

Setelah spec ini disetujui → implementasi bertahap per cluster (komponen bersama dulu: PageHeader, Toolbar/BulkBar, DataTable, EmptyState, CommandPalette).
