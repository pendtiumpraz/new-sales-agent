# User Requirement — Agentic Sales AI (Rebuild)

> **File-as-interface Sainskerta Loop.** Kamu (user) edit file ini → AI baca →
> AI tanya follow-up → kamu jawab → iterasi sampai semua firm.
> **AI tidak lanjut ke Fase 01 sebelum blocker di bawah firm.**

---

## 📋 Requirement Project

### Nama Project
`Agentic Sales AI (Maira Sales)` — rebuild dari nol pakai Sainskerta Loop.

### Deskripsi Singkat
Platform sales agentic, Indonesia/WhatsApp-first. AI menjalankan obrolan sales
konsultatif value-first yang meng-enforce metodologi closing. **1 workspace = 1
produk.** RPA extract/profil lead, AI recommend + filter product-fit, eksekusi &
atribusi per akun sales rep.

### Target Pengguna
Tim sales / sales rep SMB di Indonesia, kerja utama via WhatsApp.

### Deadline
`[isi: YYYY-MM-DD atau "tidak ada"]`

### Mode Rebuild
**Full greenfield** — patuh penuh `loop-workflow/RULES-OF-THE-GAME.md`
(no dummy data, modular monolith, CRUD-one-page + right-drawer, sidebar 1-color
icon, soft-delete + restore, snake_case, backend-dulu, audit-sebelum-deploy).

### 🔒 ATURAN WAJIB — DESIGN-FIRST (non-negotiable, firm 2026-06-28)
**Tiap page di-desain dari HTML dulu (mockup) sebelum dieksekusi.** Urutan:
HTML wireframe (low-fi) → **aku approve** → HTML mockup (high-fi, bisa diklik &
navigasi antar page) → **aku approve** → BARU coding. Berlaku untuk SEMUA page,
termasuk page baru nanti. Aku mau lihat flow tampilan frontend dulu, gak mau
langsung eksekusi. (Project lama gak ada wireframe/mockup sama sekali — gak mau ngulang.)

---

## 🚧 BLOCKER Fase 00 — tolong jawab dulu (Rule 8 & Rule 10)

> Tanpa ini project tidak bisa mulai. Edit `[jawaban]` di bawah.

1. **Database access** — Postgres sudah ada di `.env.local`? Pakai yang sekarang (Neon) atau DB baru?
   `[jawaban user: ✅ pakai Neon existing (.env.local)]`

2. **AI provider primary untuk rebuild** — sekarang ada DeepSeek + Anthropic (BYOK + metered).
   Mana yang jadi default? Key sudah siap?
   `[jawaban user: ✅ DeepSeek default; Anthropic opsional via BYOK]`

3. **Target deployment** — sekarang Vercel. Tetap Vercel, atau pindah VPS
   (Fase 06 loop nyiapin Nginx + SSL + bare-metal)?
   `[jawaban user: ✅ tetap Vercel (VPS nanti kalau butuh WA 24/7)]`

4. **Snapshot prototype lama** — ✅ **SELESAI** (2026-06-28). tag `pre-loop-rebuild` +
   branch `archive/pre-loop-rebuild`, dua-duanya di `5ecac8f`. Demo lama bisa di-checkout balik.
   `[jawaban user: ya — snapshot dulu]`

5. **Scope rebuild awal** — ~100 route + subsistem besar (WA gateway, extension, billing,
   closing-flow) terlalu besar untuk sekali jalan. Modul inti mana dulu?
   `[jawaban user: ✅ Module 1 = Auth/Tenant/Onboarding (register → superadmin activate → onboarding pilih vertical + white-label → dashboard shell). Lalu: Workspace+Product → Contacts/CRM → Inbox/WA → Enrichment.]`

---

## 🏗️ Arsitektur — USULAN AI (tolong konfirmasi / ubah)

> Ini usulan, bukan keputusan. Firm-kan di Fase 01.

| Aspek | Usulan | Konfirmasi |
|-------|--------|------------|
| Backend | Next.js 14 App Router (full-stack TS), modular monolith via `modules/<domain>/{schema,repo,service,api}` | ✅ **YA** (firm 2026-06-28) |
| Frontend | React (Next.js) + Tailwind + shadcn/ui + Zustand | `[ya / ubah]` |
| Database | PostgreSQL (Neon) + Drizzle — **no FK, snake_case, soft-delete** (sudah sesuai) | `[ya / ubah]` |
| Deployment | `[Vercel / VPS]` | `[isi]` |
| Domain / SSL | `[domain / belum]` — `[Let's Encrypt / Cloudflare / Vercel]` | `[isi]` |
| AI | Multi-provider BYOK + metered (registry sudah ada) — default `[DeepSeek / Anthropic]` | `[isi]` |
| Auth | next-auth email/password + multi-tenant RBAC (grain = tenant) | `[ya / ubah]` |

**Catatan penting (jujur):** stack di atas = stack yang SEKARANG dipakai. "Rebuild"
artinya bikin ulang bersih supaya patuh 11 rules (utamanya buang lapisan mock-first
`lib/api-mock/` + `lib/mock-data/` dan susun ulang jadi modul), **bukan** ganti
framework. Kalau kamu mau ganti framework (mis. split Laravel/Express backend +
React/Vite frontend seperti contoh default loop), bilang di sini:
`[jawaban user: ✅ tetap Next.js full-stack]`

---

## 🆕 Requirement tambahan (firm 2026-06-28)

1. **Branding/theme PER-USER (hanya berlaku untuk user itu)** — halaman **`/branding`**: tiap user ubah SELURUH CSS-nya sendiri (semua token warna, bukan cuma primary) + **logo** + **favicon** + opsi Custom CSS. **Default = Coral Sunset existing (jangan diganti)**; ada reset + live preview. Cuma kelihatan sama user itu, bukan se-tenant.
2. **Multi-vertical / usage-based onboarding** — 1 produk sales ini dipakai banyak use-case. Saat onboarding tenant pilih **vertical/usage** (mis. A=HR, B=Sales, C=lainnya) → nge-set **modul + entitlements** yang aktif. Usage **terbatas sesuai onboarding** (tenant grain).
3. **Register + aktivasi superadmin** — halaman register beneran jadi & rapi; akun baru **pending** sampai **superadmin aktifkan** (set durasi + kuota). Superadmin console buat activate/suspend/buat-akun.
4. **CRM module** — belum ada, harus dibikin: contacts/companies/deals/activities (pipeline), first-class module.
5. **Enrichment** — sekarang kurang; perbaiki (kualitas data lead + profil).
6. **UI & flow re-design** — yang lama "kurang srek"; rebuild dengan UX yang koheren (design-first mockup wajib).
7. **Soft-delete + HARD-delete + Restore di SEMUA fitur** — termasuk hasil crawl/enrichment (di app lama belum ada). Tiap resource: bisa di-soft-delete (`deleted_at`), di-restore, DAN di-hard-delete (purge permanen). Harus ke-expose di UI (trash view + restore + delete). Data demo/seed juga harus bisa dihapus (seed deletable, `scripts/rebuild-demo-seed.mts --unseed`).

> **Catatan:** user butuh **segera show**. Prioritas: keluarin flow tampilan (wireframe/mockup) cepat biar bisa di-review, baru build.

## 👀 APPROVAL GATE — Wireframe Module 1 (low-fi)

> Buka `wireframes/index.html` di browser, klik-klik flow-nya. Lalu isi di bawah.
> Halaman: login · register · pending · superadmin-users · onboarding · dashboard-shell.

```
[APPROVAL_SECTION_START]
Status: APPROVED         # flow wireframe lengkap di-approve 2026-06-28
Timestamp: 2026-06-28
Feedback: Flow + kelengkapan fitur OK (workspace B2C/B2B + enrichment + inventaris semua fitur). Lanjut: sync 6 halaman lama jadi high-fi + mockup high-fi SEMUA page (default Coral Sunset), digerakkan loop tick tiap 5 menit per batch. Stop di gate approval mockup.
[APPROVAL_SECTION_END]
```

- ✅ Approve → aku upgrade ke **mockup high-fi** (full color, white-label live, interaktif).
- ❌ Revisi → tulis poin di Feedback, aku iterasi wireframe (murah).

## 👀 APPROVAL GATE — Mockup high-fi (13 halaman, Coral Sunset)

> Buka `mockups/index.html`. Semua interaktif (drawer, step wizard, tab, branding live-theming).
> Setelah approve → **Fase 03 Backend** (baru nulis kode). Sebelum approve, gak ada kode app.

```
[MOCKUP_APPROVAL_START]
Status: APPROVED         # 13 mockup high-fi di-approve 2026-06-28
Timestamp: 2026-06-28
Feedback: OK semua. Lanjut Fase 03 Backend (Module 1 dulu).
[MOCKUP_APPROVAL_END]
```

## 🎤 Feedback / Catatan Lain
```
[tulis di sini]
```

---

## 📝 Riwayat Percakapan

### `2026-06-28` — AI → User
```
Loop sudah di-scaffold (loop-workflow/ + .claude/loop.md + tracker terpisah).
Masuk Fase 00 Prerequisites. Tolong jawab 5 blocker di atas + konfirmasi arsitektur.
Begitu firm, aku lanjut Fase 01 Planning (breakdown modul + roadmap).
```
