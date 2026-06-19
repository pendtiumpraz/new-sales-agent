# Wireframe 08 — Pengaturan (unified)

Cakupan: Pengaturan + 10 sub-halaman. Mengikuti `00-redesign-system.md` (Template F).

**Keputusan IA utama:** 11 tujuan nav "Pengaturan" yang terpisah dilebur jadi **SATU halaman `/settings` dengan sub-nav kiri**. Sidebar utama cukup 1 item "Pengaturan". Mengurangi sprawl + memberi pola "satu rumah, banyak section".

```
┌ Pengaturan                                                                              ┐
├ Sub-nav (kiri) ──────────────┬ Konten section (kanan) ────────────────────────────────┤
│ Akun & Profil                │  (judul section)                          [Simpan]      │
│ Tim & Akses           [adm]  │  ┌ form / tabel section aktif ─────────────────────┐    │
│ Mailbox                      │  │                                                  │    │
│ AI & Model            [adm]  │  └──────────────────────────────────────────────────┘    │
│ Billing & Kuota       [own]  │                                                          │
│ Kepatuhan (PDP)       [dpo]  │  ← tiap section punya tombol "Simpan" sendiri           │
│ Extension LinkedIn           │                                                          │
│ Knowledge Base        [adm]  │                                                          │
│ Handoff               [adm]  │                                                          │
│ Diagnostics           [adm]  │                                                          │
└──────────────────────────────┴────────────────────────────────────────────────────────────┘
```
Sub-nav item disembunyikan sesuai permission (rep tak lihat AI/Billing/KB; DPO lihat Kepatuhan).

| Section | Route lama | Isi |
|---|---|---|
| Akun & Profil | `/settings` | profil, bahasa, tema |
| Tim & Akses | `/settings/team` | anggota, peran, undang |
| Mailbox | `/settings/mailboxes` | sambung Gmail/SMTP, cap harian |
| AI & Model | `/settings/ai` | model aktif, BYOK, pemakaian |
| Billing & Kuota | `/settings/billing` | paket, meter kuota |
| Kepatuhan | `/settings/compliance` (+`/dsar`) | consent/DPIA/vendor/erasure |
| Extension | `/settings/extension` | unduh & status collector |
| Knowledge Base | `/settings/knowledge-base` | sumber/produk/segmen + AI test |
| Handoff | `/settings/handoff` | ambang sentimen, timeout, topik |
| Diagnostics | `/settings/diagnostics` | status sistem/integrasi |

---

### Akun & Profil — Template: F
**Tujuan:** identitas user + preferensi (bahasa BI/EN, tema). **Aksi:** Simpan.
**Masalah sekarang:** "Pengguna aktif" (USERS=5) vs Billing "10/10" dulu kontradiksi (sudah direkonsiliasi); roster live ada di Tim.
```
Akun & Profil                                                           [Simpan]
 Nama [____]  Email [____ (read-only)]   Peran: ◌ chip
 Bahasa: ( ) Bahasa Indonesia  ( ) English      Tema: ( ) Terang ( ) Gelap
 → Roster lengkap di "Tim & Akses"
```
**States:** loading skeleton; error retry. **Mobile:** form penuh-lebar.

---

### Tim & Akses — Template: F (tabel) · [admin]
**Tujuan:** kelola anggota + peran; undang. **Aksi:** **+ Undang anggota**.
```
Tim & Akses                                                    [+ Undang anggota]
 ┌ Anggota ── Nama · Email · Peran ▾ · Status · ⋯ ──────────────────────┐
 │ Galih · owner ·  aktif · ⋯                                            │
 └──────────────────────────────────────────────────────────────────────┘
 (sumber tunggal kebenaran roster — section lain merujuk ke sini)
```
**States:** empty → "Undang anggota pertama"; loading skeleton. **Mobile:** kartu per anggota.

---

### Mailbox — Template: F · 
**Tujuan:** sambung mailbox pengirim (Gmail/Outlook/SMTP); lihat cap harian. **Aksi:** **+ Hubungkan mailbox**.
**Masalah sekarang:** "X/limit hari ini" dulu counter lifetime (sudah → dihitung dari log harian Asia/Jakarta).
```
Mailbox                                                     [+ Hubungkan mailbox]
 ┌ akun ── fromEmail · tipe · 23/200 hari ini · aktif · [Hapus] ────────┐
 └──────────────────────────────────────────────────────────────────────┘
 [Hubungkan Gmail] [Hubungkan Outlook] [SMTP manual]
```
**States:** empty → "Belum ada mailbox — hubungkan untuk kirim"; error retry. **Mobile:** kartu per mailbox.

---

### AI & Model — Template: F · [admin]
**Tujuan:** pilih 1 model aktif (per tenant), BYOK, pantau pemakaian. **Aksi:** **Aktifkan model**.
**Masalah sekarang:** copy "per workspace" salah (sudah → per tenant); pemakaian lifetime (sudah → bulan ini + "(USD)").
```
AI & Model                          Model aktif berlaku per TENANT (semua workspace)
 ┌ Pemakaian bulan ini ── Panggilan · Token · Biaya (USD) ──────────────┐
 └──────────────────────────────────────────────────────────────────────┘
 Provider/model: ◉ Deepseek v4-flash  ○ Claude  ○ GPT …   [Aktifkan]
 BYOK: [API key per provider…]
```
**States:** loading skeleton; error retry. **Mobile:** kartu pemakaian + list model.

---

### Billing & Kuota — Template: F · [owner]
**Tujuan:** paket aktif + pemakaian vs kuota + total bayar. **Aksi:** **Upgrade / Kelola**.
**Masalah sekarang:** meter all-time vs kuota bulanan (sudah → window bulan); total bayar tak ada (sudah → price×seats); kuota null = bar kosong (sudah → "kuota belum diset").
```
Billing & Kuota
 ┌ Paket Growth · 5 kursi ─────────── Rp 449k/kursi · Total Rp 2,2 jt/bln ┐
 └────────────────────────────────────────────────────────────────────────┘
 Token AI   ███░░ 60% (bulan ini)    Email  ██░░ 30%    Kursi  5/10
 (kuota belum diset → bar putus-putus + label)            [Upgrade ▾] [Portal]
```
**States:** loading skeleton; error retry. **Mobile:** meter tumpuk.

---

### Kepatuhan (PDP) — Template: F · [DPO: owner/admin]
**Tujuan:** register kepatuhan per-tenant: consent, DPIA, vendor, **antrean hak hapus live**. **Aksi:** Ekspor laporan.
**Masalah sekarang:** dulu global + Superadmin-only + antrean statis (sudah → per-tenant, akses DPO, erasure queue live dari suppression).
```
Kepatuhan UU PDP                                       Skor 94/100   [Ekspor]
 [ Ringkasan ] [ Consent ] [ DPIA ] [ Vendor ]
 ┌Disetujui 60%┐ ┌Menunggu 28%┐ ┌Tanpa izin 12%┐ ┌Hapus: N┐  ← dari LOG nyata
 └─────────────┘ └────────────┘ └──────────────┘ └────────┘
 ┌ Antrean hak hapus (LIVE) ── email · alasan · waktu · [Proses di DSAR] ┐
 │ (kosong → "Tidak ada permintaan hapus tertunda")                       │
 └────────────────────────────────────────────────────────────────────────┘
```
**Sub: DSAR** `/settings/compliance/dsar` — proses ekspor/hapus subjek by email (export bundle / delete + suppress), jejak audit per-tenant.
**States:** empty queue → empty state jujur; loading skeleton; error retry. **Mobile:** tab → kartu.

---

### Extension LinkedIn — Template: F
**Tujuan:** unduh & hubungkan collector; lihat status. **Aksi:** **Unduh extension**.
```
Extension LinkedIn                                          [Unduh extension]
 Status: ● Terhubung · sesi aktif · 86 terkirim hari ini
 Langkah: 1 unduh · 2 pasang · 3 login LinkedIn · 4 hubungkan
```
**States:** not-connected → langkah + tombol; connected → status; error → "sesi putus, sambung ulang". **Mobile:** langkah vertikal.

---

### Knowledge Base — Template: F · [admin]
**Tujuan:** kelola sumber/produk/segmen RAG + uji jawaban AI. **Aksi:** **+ Tambah sumber**.
**Masalah sekarang:** "Sumber aktif" hitung active saja (sudah → active+indexed); badge model hardcode (sudah → model nyata); mock test abaikan prompt (catatan: live path sudah hormati).
```
Knowledge Base                                                [+ Tambah sumber]
 ┌Sumber aktif (indexed)┐ ┌Produk┐ ┌Segmen┐ ┌Flow retensi┐
 └──────────────────────┘ └──────┘ └──────┘ └────────────┘
 [ Sumber ] [ Produk ] [ Segmen ] [ Uji AI ]
 Uji AI: prompt […] [Live · <model aktif>]  → jawaban + sumber RAG
```
**States:** empty sumber → "Tambah sumber pertama"; loading skeleton; error retry. **Mobile:** tab → list.

---

### Handoff — Template: F · [admin]
**Tujuan:** atur pemicu eskalasi global (ambang sentimen, timeout, topik kompleks). **Aksi:** Simpan.
```
Handoff (default global)                                                [Simpan]
 Ambang sentimen [— slider 30] · Timeout [15] mnt
 Topik kompleks: [refund][hukum][keluhan] [+ tambah]
 Auto-reply default: [●]   (override per-percakapan ada di Inbox)
```
**States:** loading skeleton. **Mobile:** form penuh-lebar.

---

### Diagnostics — Template: F · [admin]
**Tujuan:** status sistem/integrasi (DB, AI, mailbox, WA gateway, extension). **Aksi:** **Jalankan cek**.
```
Diagnostics                                                    [Jalankan cek ▸]
 ● Database        ok        ● AI provider   ok (model aktif)
 ● Mailbox SMTP    ok        ● WA gateway    belum dikonfigurasi
 ● Extension       terhubung ● Kill-switch   nonaktif
```
**States:** idle → daftar status; running → spinner per item; error → merah + detail. **Mobile:** list status vertikal.

---

## Catatan implementasi (setelah spec disetujui)
Bangun komponen bersama dulu, lalu terapkan per cluster:
1. `PageHeader` (1 primary + ≤2 sekunder + ⋯)
2. `Toolbar` + `BulkBar`
3. `DataTable` (sticky, kolom-kunci, angka rata-kanan, row-hover actions, drawer)
4. `EmptyState` / `LoadingSkeleton` / `ErrorState`
5. `CommandPalette` (⌘K)
6. `SettingsShell` (sub-nav kiri)
7. Sidebar IA baru (5 seksi) + chip Workspace di TopBar
Lalu migrasi halaman cluster demi cluster (01→08), uji `tsc`+`lint` tiap langkah.
