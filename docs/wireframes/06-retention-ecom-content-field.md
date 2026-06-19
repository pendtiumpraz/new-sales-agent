# Wireframe 06 — Retensi · E-Commerce · Konten · Lapangan

Cakupan: Retensi (+flow), E-Commerce, Konten, Field (+visits). Mengikuti `00-redesign-system.md`.

| Halaman | Route | Template |
|---|---|---|
| Retensi | `/retention` | A/B · KPI + card grid |
| Detail flow | `/retention/[flowId]` | E · Builder |
| E-Commerce | `/ecommerce` | B · Channel + tabel |
| Konten | `/content` | B · Kalender/list |
| Sales Lapangan | `/field` (+`/visits`) | G · Map |

---

### Retensi — `/retention` · Template: A + card grid
**Tujuan:** jaga pelanggan via flow (repeat/upsell/after-sales); pantau kandidat.
**Aksi utama:** **+ Buat flow**.
**Masalah sekarang:** KPI `activeCustomers` statis & berbeda dari sum enrolled (sudah direkonsiliasi); kandidat global tanpa scope.

```
┌ Retensi & After-Sales                                              [+ Buat flow ▸]     ┐
│ ┌Pelanggan aktif┐ ┌Repeat MTD┐ ┌Upsell rate┐ ┌NPS┐   ← KPI direkonsiliasi              │
│ └───────────────┘ └──────────┘ └───────────┘ └───┘                                      │
│ [ Flow ] [ Kandidat ]                                                                    │
│ ┌ kartu flow ───────────────────────────────────────────────────────────────────────┐  │
│ │ Repeat 30 Hari · WA→WA→Email · aktif · 142 enrolled · 28% konversi   [▸] [⏸]        │  │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│ (tab Kandidat: daftar pelanggan + skor + flow rekomendasi + [Daftarkan])                 │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** KPI = turunan nyata (bukan konstanta); card grid flow + tab Kandidat; tiap kandidat punya aksi daftar.
**States:** empty → "Belum ada flow — Buat dari template"; loading → skeleton kartu; error → retry.
**Mobile:** KPI 2×2 → kartu flow 1 kolom.

---

### Detail flow — `/retention/[flowId]` · Template: E (Builder)
**Tujuan:** atur pemicu, langkah, dan **audiens yang didaftarkan**.
**Aksi utama:** **Daftarkan audiens** (dari filter) — sekunder: Simpan.
**Masalah sekarang:** "Simpan filter" dulu **tak mendaftarkan siapa pun** (sudah → aksi Daftarkan); pemicu free-text (sudah → terstruktur); estimasi abaikan segmen/tag (sudah).

```
┌ ‹ Retensi / Repeat 30 Hari                       [aktif]   [⏸ Jeda]   [Simpan]         ┐
├ Pengaturan flow ──────────────────────────┬ Audiens & filter ───────────────────────┤
│ Nama / Deskripsi                           │ Segmen [▾]  Min–Max hari [_]–[_]         │
│ Pemicu: [Hari sejak pembelian ▾] [30] hari │ Tag: [VIP][Repeat]…                      │
│   → "30 hari sejak pembelian terakhir"     │ ~ 12 kandidat cocok                       │
│ ─ Langkah (stepper + editor + preview) ─   │ [Simpan filter]   [Daftarkan audiens ▸]  │
└──────────────────────────────────────────────┴──────────────────────────────────────────┘
```
**Perubahan kunci:** pemicu **terstruktur** (tipe + hari, preview string); estimasi hormati segmen/tag; **"Daftarkan audiens"** benar-benar enroll + reconcile KPI; langkah pakai pola builder.
**States:** loading → skeleton; estimasi 0 → tombol Daftarkan nonaktif + "tak ada kandidat"; error → retry.
**Mobile:** pengaturan → audiens → langkah (tumpuk).

---

### E-Commerce — `/ecommerce` · Template: B
**Tujuan:** pesanan Tokopedia/Shopee/TikTok + pemulihan keranjang.
**Aksi utama:** (per baris) **Pulihkan** (keranjang) / **Tawarkan ulang** (dibatalkan).
**Masalah sekarang:** keranjang ditinggalkan dulu disamakan "dibatalkan" (sudah dipisah); "Hubungkan" cuma state lokal (sudah disoftening).

```
┌ E-Commerce                                                                              ┐
│ ┌ Tokopedia ✓┐ ┌ Shopee ✓┐ ┌ TikTok  [Hubungkan]┐   ← kartu channel (status jujur)     │
│ │ 64 pesanan │ │ 38       │ │ —                  │                                       │
│ └────────────┘ └──────────┘ └────────────────────┘                                       │
│ 🔎 cari…  [Channel ▾][Status ▾]                                                          │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│ │ Order   Channel  Pelanggan  Total    Status                 Aksi                  │   │
│ │ INV..   Tokopedia …         Rp..     ● Keranjang ditinggalk. [Pulihkan]            │   │
│ │ INV..   Shopee   …          Rp..     ● Dibatalkan            [Tawarkan ulang]      │   │
│ │ INV..   …        …          Rp..     ● Diterima              —                     │   │
│ └──────────────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** **Keranjang ≠ Dibatalkan** (status + aksi beda); "Hubungkan" jujur (mode demo); draf WA pemulihan/tawar-ulang beda copy.
**States:** empty → "Belum ada pesanan — Hubungkan channel"; loading → skeleton; error → retry.
**Mobile:** kartu channel tumpuk; order jadi kartu.

---

### Konten — `/content` · Template: B (kalender/list)
**Tujuan:** buat & jadwalkan konten marketing per audiens/channel.
**Aksi utama:** **+ Buat konten**.
**Masalah sekarang:** window KPI di-anchor tanggal hardcoded (beku di Mei); 'approved' tak punya tile; audience free-text tak terhubung KB.

```
┌ Konten                                       [ Kalender | Daftar ]   [+ Buat konten ▸] ┐
│ ┌Draf┐ ┌Disetujui┐ ┌Terjadwal┐ ┌Terbit┐   ← KPI dari clock NYATA (bukan beku)          │
│ └────┘ └─────────┘ └─────────┘ └──────┘                                                  │
│ [Channel ▾][Audiens ▾ (terikat KB segmen)][Status ▾]                                     │
│ ┌ Kalender bulan ──────────────────────────────────────────────────────────────────┐   │
│ │  Sen  Sel  Rab …   ▣ "Studi kasus" (WA, 09:00, terjadwal)                          │   │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** window KPI dari `Date.now()`; tile **Disetujui** ditambah; audiens jadi select terikat segmen KB; toggle Kalender/Daftar.
**States:** empty → "Belum ada konten — Buat (AI bantu)"; loading → skeleton; error → retry.
**Mobile:** Daftar default (kalender berat di HP); kartu per konten.

---

### Sales Lapangan — `/field` (+`/visits`) · Template: G (Map)
**Tujuan:** pantau tim lapangan real-time + log kunjungan.
**Aksi utama:** **Log kunjungan** (→ `/field/visits`).
**Masalah sekarang:** tampilkan SEMUA rep tanpa scope role; pilih rep lalu ganti tab tak reset (sudah → seleksi dari list tampil).

```
┌ Sales Lapangan                          [ Live | Semua ]              [Log kunjungan]  ┐
├ Peta (besar) ───────────────────────────────────────┬ Daftar rep ─────────────────────┤
│   ● Andi (kunjungan)  ● Maya (istirahat)            │ 🔎 cari rep                     │
│   ● … pin live                                       │ Andi · kunjungan · 3 visit hari │
│                                                       │ Maya · istirahat                │
│   (klik pin / baris → detail rep + rute)             │ ↑ scoped per role/tim           │
└───────────────────────────────────────────────────────┴──────────────────────────────────┘
  /field/visits → tabel log kunjungan (rep · pelanggan · hasil · waktu · foto)
```
**Perubahan kunci:** scope per role (rep→sendiri, manajer→tim); seleksi sinkron peta↔daftar; tab Live|Semua tak menyisakan seleksi hantu.
**States:** empty → "Belum ada rep aktif"; loading → peta+list skeleton; error → retry.
**Mobile:** peta atas + daftar rep bawah; detail rep full-screen.
