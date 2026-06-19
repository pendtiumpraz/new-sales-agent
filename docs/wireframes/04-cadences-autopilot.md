# Wireframe 04 — Cadence & Autopilot

Cakupan: Cadence (+new, +detail), Autopilot. Mengikuti `00-redesign-system.md`.

| Halaman | Route | Template |
|---|---|---|
| Cadence | `/cadences` | B · List (card/table) |
| Buat cadence | `/cadences/new` | E · Builder |
| Detail cadence | `/cadences/[id]` | D · Detail |
| Autopilot | `/autopilot` | A · Hero satu-klik |

---

### Cadence — `/cadences` · Template: B
**Tujuan:** kelola urutan pesan lintas channel; jalankan yang jatuh tempo.
**Aksi utama:** **+ Buat cadence**.
**Masalah sekarang:**
- Tiga tombol aksi global (Auto-reply, Upsell, Jalankan sekarang) berbobot sama + 1 buat → bingung.
- "Jalankan sekarang" dulu blast semua workspace (sudah discope) — tapi user tak sadar scope-nya.
- KPI hitung dari semua cadence, bukan yang difilter (sudah).

```
┌ Cadence                          Workspace: Ekspor ▾   [⋯ Aksi]  [+ Buat cadence ▸]   ┐
│ ┌Aktif┐ ┌Enrolled┐ ┌Avg balas┐    ← KPI dari yang TAMPIL (scoped)                      │
│ └─────┘ └────────┘ └─────────┘                                                          │
│ 🔎 cari…  [Channel ▾][Status ▾]   ↕                                       [⛁ Arsip]    │
│ ┌ kartu cadence ───────────────────────────────────────────────────────────────────┐  │
│ │ Demo Growth · WA→Email→WA · aktif · 142 enrolled · 32% balas      [▸] [▶ Jalankan] │  │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│ (banner kecil bila difilter: "Jalankan sekarang hanya untuk workspace ini")             │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** aksi sekunder (Auto-reply/Upsell/Jalankan-semua) masuk menu **⋯ Aksi**; "Jalankan" per-kartu + banner scope eksplisit; KPI scoped; klik kartu → detail.
**States:** empty → "Belum ada cadence — Buat (AI bantu draf)"; loading → skeleton kartu; error → retry.
**Mobile:** kartu 1 kolom; ⋯ Aksi sheet.

---

### Buat cadence — `/cadences/new` · Template: E (Builder)
**Tujuan:** rangkai langkah (channel + jeda + konten), atur jadwal, aktifkan.
**Aksi utama:** **Aktifkan cadence** (sticky) — sekunder: Simpan draf.
**Masalah sekarang:**
- Tab "Pengaturan" (jam kirim/hari/max) dikumpul ke state lokal tapi **tak dipersist** (banner sendiri akui) → rep set jadwal, diabaikan.
- "Draf AI" dulu palsu (cycle array) → sudah jadi "Template" jujur.

```
┌ ‹ Cadence / Buat                                          Draf tersimpan ✓             ┐
│ Langkah ① ─ ② ─ ③  (stepper)        Workspace: [Ekspor ▾]                              │
├ Editor langkah ─────────────────────────────┬ Pratinjau ─────────────────────────────┤
│ Langkah 1 · [WhatsApp ▾] · jeda [0] hari     │ Halo {{nama}} 👋 …                      │
│ [ konten… {{nama}} {{perusahaan}} ]          │ (render contoh)                        │
│ [Pakai template ▾]   [+ Tambah langkah]      │                                        │
│ ─ Tab: [ Langkah ] [ Pengaturan jadwal ] ─   │                                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  SAVE BAR (sticky):  Jadwal: Sen–Jum 09–17, max 50/hari   [Simpan draf]  [Aktifkan ▸]  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
**Perubahan kunci:** stepper + preview kanan; **jadwal benar-benar dipersist** & dihormati processor (atau tab disembunyikan bila belum) — tak ada setelan hantu; "Template" jujur; save-bar sticky dengan status.
**States:** draf baru → 1 langkah contoh; saving → "menyimpan…"; error → "gagal simpan, coba lagi".
**Mobile:** stepper atas → editor → preview (tumpuk); save-bar sticky.

---

### Detail cadence — `/cadences/[id]` · Template: D
**Tujuan:** lihat langkah, kontak terdaftar (aktif vs selesai), daftarkan kontak baru.
**Aksi utama:** **+ Daftarkan kontak**.
**Masalah sekarang:** badge "X terdaftar" hitung semua termasuk selesai/berhenti (sudah → "aktif/total"); enrolled denormalized beda dengan list.

```
┌ ‹ Cadence / Demo Growth                          [aktif]   [▶ Jalankan]  [⋯]          ┐
│ 3 langkah · 32% balas · 18 aktif · 142 total                                          │
├ Langkah ──────────────────────────────┬ Kontak terdaftar (18 aktif / 142 total) ─────┤
│ ① WA  jeda 0   "Halo {{nama}}…"        │ 🔎 + [Daftarkan kontak]                       │
│ ② Email jeda 3 …                       │ Budi · langkah 2/3 · ● aktif                 │
│ ③ WA  jeda 5 …                         │ Sari · ● selesai                             │
└────────────────────────────────────────┴───────────────────────────────────────────────┘
```
**Perubahan kunci:** badge "aktif/total" jujur; langkah kiri + enrollment kanan; picker enroll workspace-scoped; status chip per kontak.
**States:** empty enroll → "Belum ada kontak — Daftarkan"; loading → skeleton; error → retry.
**Mobile:** langkah → kontak (tumpuk); enroll via sheet.

---

### Autopilot — `/autopilot` · Template: A (Hero satu-klik)
**Tujuan:** jalankan pipeline AI 10-tahap satu klik, dengan guardrail keamanan.
**Aksi utama:** **Mulai Autopilot** (raksasa) → saat jalan jadi status-bar + Hentikan.
**Masalah sekarang:** guardrail dulu palsu (sudah ditegakkan: quiet hours, cap LI, jeda-sebelum-DM); pause/resume kini ada banner. Layout sudah kuat — fokus: legibilitas guardrail + state jeda.

```
┌ Autopilot · pipeline AI 10 tahap                              Tujuan: [Booking ▾]      ┐
│ ┌ HERO ─────────────────────────────────────────────────────────────────────────────┐ │
│ │  "Satu klik. Pipeline AI berjalan."                                                 │ │
│ │            [ 🚀 Mulai Autopilot ]      Siap · 12 prospek terdeteksi                  │ │
│ └─────────────────────────────────────────────────────────────────────────────────────┘ │
│ (saat jeda) ⏸ Autopilot dijeda — menunggu persetujuan  [Lanjutkan kirim] [Batalkan]     │
├ Audiens & Guardrails (kiri) ─────────────────┬ Timeline + Ringkasan (kanan) ───────────┤
│ Segmen/skor/kota/cap                          │ ① pilih audiens ✓                       │
│ Guardrails: max LI/hari · jam tenang · jeda   │ ② tulis catatan… ⏳                      │
│ sebelum kirim DM   (semua DITEGAKKAN)         │ KPI: prospek·LI·diterima·balas·meeting  │
└────────────────────────────────────────────────┴──────────────────────────────────────────┘
```
**Perubahan kunci:** hero tetap (kuat); banner **jeda** dengan Lanjutkan/Batalkan; panel guardrail diberi catatan "aktif/ditegakkan"; saat run, hero → status-bar progress + Hentikan.
**States:** idle → hero + estimasi; running → status-bar; paused → banner amber; quiet-hours → "Jam tenang — tidak mengirim"; done → ringkasan + "Jalankan ulang".
**Mobile:** hero → guardrails → timeline (tumpuk); banner jeda sticky.
