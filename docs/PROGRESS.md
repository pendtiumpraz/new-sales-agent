# Progress Report — SaaS Sales Intelligence Platform

Laporan progres hidup. Di-update tiap ada kemajuan. Rencana penuh di
[`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md); visi di `docs/18`–`27`.

**Legenda:** ✅ selesai · 🟡 jalan · ⬜ belum · ⛔ keblok

_Terakhir diperbarui: 2026-06-15_

## Ringkasan

| Fase | Judul | Status |
|------|-------|--------|
| 0 | Persiapan & docs + spike auth/queue | ✅ |
| 1 | Fondasi tenant (RLS + RBAC + auth) | 🟡 |
| 2 | Data model Company/Person/ContactPoint | ⬜ |
| 3 | AI registry + metering | ⬜ |
| 4 | Acquisition MVP + positioning | ⬜ |
| 5 | Engagement: mailbox + send worker + cadence | ⬜ |
| 6 | Chrome extension RPA | ⬜ |
| 7 | Compliance hardening | ⬜ |
| 8 | Superadmin + observability + billing | ⬜ |

## Detail terbaru

### Fase 0 — Persiapan & docs + spike ✅
- ✅ Setup Claude Code: `CLAUDE.md`, `CLAUDE.local.md`, skill `/ship` & `/db-refresh`, hook eslint-fix
- ✅ Branch `new-main` dibuat
- ✅ `npm install` (715 packages) + dev server jalan (`http://localhost:3001`)
- ✅ Design docs `18`–`27` ditulis
- ✅ `IMPLEMENTATION-PLAN.md` + `PROGRESS.md` ditulis
- ✅ Spike keputusan **terkunci**: Auth.js v5 + Drizzle & Inngest (decision record di [doc 28](./28-decisions-auth-and-queue.md))

### Fase 1 — Fondasi tenant 🟡
**Slice 1 (additive, demo-safe) — selesai:**
- ✅ Schema: `tenants`, `memberships`, `invites`, `audit_log` + `tenant_id` (nullable) di tabel tenant-scoped — `lib/db/schema.ts`
- ✅ Migration baseline ke-generate & divalidasi **offline**: `drizzle/migrations/0000_tenant_foundation.sql`
- ✅ Schema **di-apply ke DB Neon live** (idempotent direct-client — `db:push` butuh TTY, jadi pakai script DDL setara dari migration)
- ✅ RBAC matrix 4 role kanonik + `can()` + `mapDemoRole()` — `lib/rbac/permissions.ts`
- ✅ Connection wrapper `withTenant()` (set_config `app.*`, injection-safe) — `lib/db/tenant-context.ts`
- ✅ RLS policies (FORCE + superadmin bypass) **siap tapi belum di-apply** — `drizzle/rls/`

**Slice 2a — Auth.js Credentials ✅ (selesai & diuji):**
- ✅ `next-auth@5` terpasang + `AUTH_SECRET` di `.env.local`
- ✅ Server foundation: config `lib/auth/auth.ts` (Credentials → demo accounts, JWT bawa role+tenantId), route `app/api/auth/[...nextauth]`, type augmentation
- ✅ Wiring UI: `SessionProvider` + `middleware.ts` proteksi server-side + login `signIn` + bridge `AuthSync` (useSession→Zustand) + gating layout via session. **Auto-Superadmin dihapus**, route login lama dibuang
- ✅ Diuji end-to-end (curl): `/dashboard` tanpa sesi → redirect `/login`; login bener → session `role:superadmin tenantId:t_default`; `/dashboard` ber-sesi → 200; password salah → ditolak, no session
- ⬜ OAuth Google/MS (butuh creds) + authorize lewat `usersTable`

**Slice 2b — isolasi data layer (sebagian, ada blocker):**
- ✅ Backfill: tenant `t_default` + `tenant_id` di semua baris (13.449 contacts dll) + memberships demo + kb id per-tenant — applied ke DB live
- ✅ `tenant_id` SET NOT NULL di 8 tabel tenant-scoped — applied
- ✅ Refactor 10 route `app/api/db/*` pakai `getTenantContext` + `withTenant` (read scoped, write stamp tenant_id) — helper `lib/auth/session-context.ts`
- ✅ RLS ENABLE + FORCE + policy `tenant_isolation` di 11 tabel — applied
- ⛔ **BLOCKER enforcement**: role Neon `neondb_owner` punya `BYPASSRLS` → policy di-skip (terbukti via tes isolasi). Session-config & policy benar; tinggal pilih role non-bypass. **Butuh keputusan user** (3 opsi).
- ⬜ RBAC guard di route + UI member/invite (slice 2b-2)

### Fase 2–8
Belum mulai — lihat rencana per fase di `IMPLEMENTATION-PLAN.md`.

## Keputusan arsitektur (terkunci)
- Isolasi tenant: shared DB + Postgres RLS (`tenant_id`)
- RBAC: `superadmin` → `tenant_owner` → `tenant_admin` → `member`
- Email sending: dukung semua (OAuth Gmail/MS + SMTP + platform ESP)
- AI keys: hybrid (platform default + tenant BYOK)
- Active model: per-tenant (1 aktif)
- Crawling: posture dipilih user (compliant ↔ aggressive) + Chrome extension RPA
- Discovery: AI nentuin target market (B2B/B2C) + ICP dari product; entry point URL/bidang/bulk-list/auto + cascade ke company & orang terkait; semua hasil disimpan DB
- **Auth: Auth.js v5 + Drizzle adapter** (Google/MS OAuth + magic-link); SSO enterprise bolt-on nanti — [doc 28](./28-decisions-auth-and-queue.md)
- **Queue: Inngest** (durable steps + flow-control); baris `crawl_job`/`send_job` di Postgres = system-of-record; dispatch di-abstraksi — [doc 28](./28-decisions-auth-and-queue.md)
- **Platform fleksibel**: mesin audience-intelligence + outreach umum dengan **playbook** per use-case (sales domestik/luar negeri, recruiting, sebar lowongan, event, partnership, dll); fondasi sama, playbook = layer config — [doc 29](./29-use-cases-and-flexibility.md)

## Keputusan terbuka (perlu diputuskan)
- ⬜ Billing provider (asumsi Stripe)
- ⬜ ID model AI + harga aktual (isi saat seed Fase 3, dari docs resmi provider)

## Cara update dokumen ini
Saat satu item kelar: ubah status (⬜→🟡→✅), update tanggal, dan kalau satu fase
beres penuh ganti statusnya di tabel Ringkasan. Catat keputusan baru di bagian
"Keputusan arsitektur".
