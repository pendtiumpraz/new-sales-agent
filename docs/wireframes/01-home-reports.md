# Wireframe 01 — Beranda & Wawasan

Cakupan: Dashboard, Laporan, Asisten AI. Mengikuti `00-redesign-system.md`.

| Halaman | Route | Template |
|---|---|---|
| Dashboard | `/dashboard` | A · Overview |
| Laporan | `/reports` | A · Overview + tab |
| Asisten AI | `/ai-assistant` | C · Split (riwayat + chat) |

---

### Dashboard — `/dashboard` · Template: A
**Tujuan:** rep/manajer lihat kondisi hari ini & langkah berikutnya dalam 5 detik.
**Aksi utama:** **Jalankan Autopilot** (atau "Buka tugas prioritas").
**Masalah sekarang:**
- KPI, funnel, tugas, channel-filter, dan banyak kartu berebut perhatian — tak ada urutan baca.
- Channel filter di atas mengubah SEMUA angka diam-diam; user tak sadar.
- Tile "Dibaca" vs closing tercampur; tak ada "apa yang harus saya kerjakan sekarang".

```
┌ Dashboard                                   [Channel: Semua ▾]  [Autopilot ▸] ┐
│ Selamat pagi, Galih · Workspace: Semua                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌ Pipeline ─┐ ┌ Closing ──┐ ┌ Dibaca WA ┐ ┌ Cadence ─┐   ← KPI strip (maks 4) │
│ │ Rp 1,2 M  │ │ 8  ·7 hr  │ │ 87%       │ │ 12 aktif │     label+angka+konteks │
│ └───────────┘ └───────────┘ └───────────┘ └──────────┘                        │
│ ┌ Tugas prioritas hari ini ───────────────┐ ┌ Funnel ───────────────────────┐ │
│ │ ☐ Follow-up Budi (WA) · jatuh tempo     │ │ Prospek ███████ 120           │ │
│ │ ☐ Kirim penawaran PT Astra              │ │ Kualifikasi █████ 64          │ │
│ │ ☐ Balas 3 chat belum dibaca   [Buka ▸]  │ │ Penawaran ███ 28              │ │
│ │ … 5 lagi                  [Lihat semua] │ │ Tutup █ 12        [Pipeline ▸] │ │
│ └─────────────────────────────────────────┘ └───────────────────────────────┘ │
│ ┌ Aktivitas terbaru ───────────────────────────────────────── [Lihat semua] ┐ │
│ │ • PT Astra membuka penawaran · 1 jam   • Order Tokopedia masuk · 18 mnt    │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:**
- Urutan baca tegas: KPI (≤4) → **Tugas prioritas** (aksi) → Funnel → Aktivitas. "Tugas" jadi pusat, tiap baris punya tombol langkah-berikutnya.
- Channel filter pindah ke header dengan label eksplisit + chip "Workspace: Semua" supaya scope sadar.
- Tiap widget punya "Lihat semua" → tidak buntu.
**States:** empty → "Belum ada data — mulai dengan Discovery / Autopilot"; loading → skeleton KPI+list; error → "Gagal memuat, coba lagi".
**Mobile:** KPI 2×2 → Tugas → Funnel ringkas (tumpuk vertikal).

---

### Laporan — `/reports` · Template: A + tab
**Tujuan:** manajer baca performa penjualan, keandalan AI, kualitas data.
**Aksi utama:** **Ekspor PDF**.
**Masalah sekarang:**
- Tiga domain berbeda (penjualan / AI / data) dijejal; tab ada tapi KPI bercampur delta palsu (sudah dibersihkan di audit).
- Badge "Data demo/live" & timestamp tidak menonjol → user ragu angka real.

```
┌ Laporan & Analitik                          [Data demo]   [Diperbarui 10:24] [Ekspor PDF]┐
│ [ Penjualan ] [ Keandalan AI ] [ Kualitas Data ]        ← tab, 1 domain per layar        │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌Pendapatan MTD┐ ┌Deal tutup┐ ┌Konversi┐ ┌Siklus┐    ← KPI ≤4, TANPA delta palsu          │
│ │ Rp 845 jt    │ │ 12       │ │ 24,0%  │ │ 28 hr│      subjudul deskriptif                │
│ └──────────────┘ └──────────┘ └────────┘ └──────┘                                          │
│ ┌ Funnel per channel ────────────────────┐ ┌ Top cadence (reply) ───────────────────────┐ │
│ │ WA  prospek▓ kual▓ offer▓ won▓          │ │ 1. Demo Growth   32%                       │ │
│ │ Email …            Lainnya …            │ │ 2. …                                       │ │
│ └─────────────────────────────────────────┘ └────────────────────────────────────────────┘ │
│ ┌ Leaderboard (manajer) ─────────────────────────────────────────── rep · deal · nilai ─┐ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** 1 domain per tab (tak campur); badge "Data demo/live" + timestamp jadi anchor kepercayaan di header; semua angka jujur (no fabricated delta — sudah).
**States:** empty per tab → "Belum cukup data"; loading → skeleton chart; error → retry.
**Mobile:** tab → chart full-width tumpuk; leaderboard jadi kartu.

---

### Asisten AI — `/ai-assistant` · Template: C
**Tujuan:** tanya KB/sales secara percakapan, dengan sumber jelas.
**Aksi utama:** **Kirim** (input chat).
**Masalah sekarang:**
- Badge sumber dulu hardcode "Deepseek" (sudah → "AI aktif"); status live/demo kurang jelas.
- Chat penuh layar tanpa riwayat/percakapan tersimpan → konteks hilang.

```
┌ Asisten Sales                                              [Live · AI aktif]  [Bersihkan] ┐
├ Riwayat ─────────────┬ Percakapan ──────────────────────────────────────────────────────┤
│ • Tanya harga Growth │  Anda: paket untuk tim 15 orang?                                   │
│ • Ringkas lead Astra │  AI: Untuk 15 orang, Paket Growth… [sumber: KB Harga, ICP]         │
│ • …                  │  ────────────────────────────────────────────────────────────────│
│ [+ Percakapan baru]  │  [ Tulis pesan…                                       ] [Kirim ▸]  │
└──────────────────────┴───────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** split riwayat + chat (konteks tak hilang); badge sumber jujur (live/demo + model nyata); chip "sumber" di bawah jawaban (RAG transparan).
**States:** empty → contoh pertanyaan (chips); loading → typing indicator; error → "AI tak terjangkau, pakai mode demo".
**Mobile:** chat full-screen; riwayat via drawer atas.
