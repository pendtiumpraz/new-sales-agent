# Wireframe 03 — Pipeline & Penawaran

Cakupan: Riset Prospek (Pipeline), Penawaran (+detail), Prospecting. Mengikuti `00-redesign-system.md`.

| Halaman | Route | Template |
|---|---|---|
| Pipeline (Deal) | `/pipeline` | B/G · Kanban + tabel |
| Penawaran | `/penawaran` | B · List |
| Editor penawaran | `/penawaran/[id]` | E · Builder |
| Riset Prospek | `/prospecting` | B · List + skor |

---

### Pipeline (Deal) — `/pipeline` · Template: Kanban + tabel enrichment
**Tujuan:** lihat & gerakkan deal antar tahap; enrichment + positioning AI per deal.
**Aksi utama:** **+ Deal**.
**Masalah sekarang:**
- Dua paradigma (Kanban + tabel enrichment) tercampur tanpa pemisah; hanya Kanban yang hormati workspace, tab default + KPI hero abaikan scope (sudah diperbaiki sebagian).
- Tak ada cara set workspace deal dari form → Kanban kosong.

```
┌ Pipeline                            Workspace: Ekspor ▾   [ Kanban | Daftar ]  [+ Deal]┐
│ ┌Nilai pipeline┐ ┌Closing minggu ini┐ ┌Win rate┐ ┌Stagnan>30hr┐  ← KPI scoped          │
│ └──────────────┘ └──────────────────┘ └────────┘ └────────────┘                        │
├ KANBAN ───────────────────────────────────────────────────────────────────────────────┤
│ Prospek      Kualifikasi   Penawaran    Negosiasi    Tutup                              │
│ ┌────────┐   ┌────────┐    ┌────────┐    ┌────────┐   ┌────────┐                         │
│ │PT Astra│   │…       │    │…       │    │…       │   │…       │  ← drag antar kolom      │
│ │Rp 120jt│   │        │    │        │    │        │   │        │                         │
│ └────────┘   └────────┘    └────────┘    └────────┘   └────────┘                         │
│ (toggle "Daftar" → tabel enrichment: deal · skor fit · produk rekomendasi · aksi)       │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** view-toggle tegas **Kanban | Daftar** (bukan campur); KPI + kedua view hormati Workspace; form Deal punya field Workspace (default dari aktif) → Kanban terisi; klik kartu → drawer detail+enrichment.
**States:** empty kolom → "Tarik deal ke sini / + Deal"; loading → skeleton kolom; error → retry.
**Mobile:** Kanban → daftar per-tahap (accordion); Daftar → kartu.

---

### Penawaran — `/penawaran` · Template: B
**Tujuan:** kelola semua penawaran; lacak status (draf→terkirim→dibuka→diterima).
**Aksi utama:** **+ Buat penawaran** (AI bantu).
**Masalah sekarang:** list baca workspace hanya dari URL (bocor ke semua bila tanpa param); status kurang terbaca.

```
┌ Penawaran                                  Workspace: Ekspor ▾     [+ Buat penawaran ▸] ┐
│ 🔎 cari no/pelanggan…   [Status ▾]   ↕ terbaru                            [⛁ Arsip]    │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐ │
│ │ No.        Judul            Pelanggan     Total       Status      Dibuka    ⋯      │ │
│ │ PNW-0007   Paket Growth     PT Astra      Rp 24 jt    ● Dibuka    2 jam     [▸]    │ │
│ │ PNW-0006   …                              …           ● Draf                 [▸]   │ │
│ └──────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** scope dari workspace store (bukan hanya URL); status = chip semantik (draf abu / terkirim biru / dibuka amber / diterima hijau / ditolak merah); klik → editor.
**States:** empty → "Belum ada penawaran — Buat (AI bantu susun)"; loading → skeleton; error → retry.
**Mobile:** baris jadi kartu (judul + total + status).

---

### Editor penawaran — `/penawaran/[id]` · Template: E (Builder)
**Tujuan:** susun item + harga + email pengantar, kirim, lacak.
**Aksi utama:** **Kirim** (sticky) — sekunder: Simpan.
**Masalah sekarang:** editor dulu bisa ubah penawaran SETELAH terkirim (pelanggan lihat live) — sudah dikunci. Layout panjang scroll tanpa save-bar.

```
┌ ‹ Penawaran / PNW-0007                                    [Draf]   [Arsipkan]          ┐
│ ⚠ (jika status≠draf) Terkunci — pelanggan melihat angka live. Duplikat utk ubah.       │
├ Item & harga ───────────────────────────┬ Pelanggan & kirim ─────────────────────────┤
│ ┌ desc            qty  harga  ⊗ ┐        │ Nama / Perusahaan / Email / Berlaku s.d.   │
│ │ Paket Growth    1   24 jt      │        │ Mailbox pengirim: [Pilih ▾]                │
│ │ [+ item]   [Susun ulang AI]    │        │ ┌ Pelacakan: terkirim·dibuka·diterima ─┐  │
│ └ Subtotal·PPN·Total ───────────┘        │ └───────────────────────────────────────┘  │
│ Email pengantar (subjek + body)          │ [Lihat halaman publik ↗]                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  SAVE BAR (sticky):   Tersimpan ✓        [Simpan]                       [Kirim ▸]      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** save-bar sticky (status tersimpan jelas); **lock state** terlihat (banner + input disabled) saat ≠draf; aksi AI berlabel jujur; preview publik 1 klik.
**States:** loading → skeleton 2 kolom; locked → banner amber + input nonaktif; error kirim → pesan + arahan mailbox.
**Mobile:** item → pelanggan/kirim (tumpuk); save-bar tetap sticky bawah.

---

### Riset Prospek — `/prospecting` · Template: B + skor
**Tujuan:** lead intelligence (Apollo-like): skor AI, temperatur, fit produk → kirim ke pipeline/cadence.
**Aksi utama:** **Tambah ke pipeline / cadence** (bulk).
**Masalah sekarang:** skor & temperatur kurang dijelaskan; aksi lanjut tak jelas.

```
┌ Riset Prospek                                                  [+ ke pipeline ▾]       ┐
│ 🔎 cari…   [Industri ▾][Ukuran ▾][Temperatur ▾]   ↕ skor                              │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ☐ Prospek        Perusahaan     Skor   Temp     Fit produk        ⋯                │ │
│ │ ☐ …              PT …           88 ▓   🔥panas   Paket Growth      [▸]              │ │
│ └──────────────────────────────────────────────────────────────────────────────────┘ │
│  bulk: [N dipilih · + pipeline · + cadence · Export · Batal]                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** skor sebagai bar + tooltip "kenapa"; temperatur chip; bulk → pipeline/cadence (langkah lanjut jelas); fit produk dari ICP nyata.
**States:** empty → "Jalankan riset / impor"; loading → skeleton; error → retry.
**Mobile:** baris jadi kartu (prospek + skor + temp).
