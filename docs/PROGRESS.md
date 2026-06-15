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
| 2 | Data model Company/Person/ContactPoint | ✅ |
| 3 | AI registry + metering | ✅ |
| 4 | Acquisition MVP + positioning | 🟡 |
| 5 | Engagement: mailbox + send worker + cadence | 🟡 |
| 6 | Chrome extension RPA | 🟡 |
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
- 🟡 **Enforcement**: dipilih **dedicated app role tanpa BYPASSRLS**. Disiapkan: `lib/db/client.ts` prefer `APP_POSTGRES_URL`, SQL `drizzle/rls/create-app-role.sql`, README. **Nunggu user**: bikin role `app_user` + paste connection string ke `.env.local` → lalu tes isolasi sebagai app_user. (Penyebab: `neondb_owner` punya `BYPASSRLS` → skip RLS, terbukti via tes.)
- ✅ **Slice 2b-2**: RBAC guard `requirePermission` + API `/api/tenant/members` (list/invite/role/remove) + `/api/tenant/invites/:id` revoke + UI `/settings/team` (live, withTenant-scoped) + link dari Settings. Diuji: list/invite/patch/revoke OK; rep diblok **403**, view 200; page render 200.

### Fase 2 — Data model Company/Person 🟡
**Slice 1 (schema + dedup) — selesai:**
- ✅ Tabel `company`, `person`, `contact_point` (polymorphic + provenance/consent), `product` (target_market/icp) — `lib/db/schema.ts`; tenant-scoped + RLS+FORCE+policy, **applied ke DB live**
- ✅ Types `lib/types/profiling.ts` (Company/Person/ContactPoint/Product + enums)
- ✅ Dedup `lib/profiling/dedup.ts` (normalize domain/name/contact + dedup key per tenant)
- ✅ Migration `0001_profiling.sql`; `drizzle/rls/enable-rls.sql` diperluas ke 4 tabel baru

**Slice 2 — selesai:**
- ✅ API `GET /api/db/companies` & `/api/db/people` (withTenant; contact points + people count + company name)
- ✅ UI `/contacts/profiles` — tab **Perusahaan / Orang** dengan contact point, **consent badge**, & provenance; dilink dari header `/contacts`
- ✅ Seed kurasi (6 perusahaan / 10 orang / 21 contact point) di DB live; diuji end-to-end (API source=db, page 200)
- ⬜ Migrasi `ProspectLead` → view (person ⨝ company) — ditunda ke Fase 4 (saat ingest crawl nyata)

### Fase 3 — AI registry + metering 🟡
**Slice 1 (registry + katalog) — selesai:**
- ✅ Schema: `ai_provider`/`ai_model` (katalog global, no-RLS) + `ai_credential`/`tenant_active_model`/`ai_usage` (tenant-scoped + RLS) — applied ke DB live
- ✅ Katalog di-seed: **4 provider + 8 model** — Anthropic (Fable 5/Opus 4.8–4.6/Sonnet 4.6/Haiku 4.5) dengan **ID + harga akurat dari referensi resmi**; DeepSeek chat/reasoner (harga null → diisi superadmin, nggak dikarang)
- ✅ Per-tenant **1 model aktif** (`tenant_active_model.tenant_id` = PK); `t_default` → deepseek-chat (platform key)
- ✅ Registry code: `lib/ai/registry.ts` (resolve active→credential→adapter), `adapters.ts` (deepseek+anthropic via Vercel AI SDK), `crypto.ts` (BYOK AES-256-GCM pakai AUTH_SECRET), `meter.ts` (`generateText` + catat `ai_usage` + hitung cost)
- ✅ `@ai-sdk/anthropic@3` terpasang; diuji: resolution→deepseek-chat/platform, ai_usage write, cost formula ($0.0175), crypto roundtrip, makeModel instance

**Slice 2 — selesai:**
- ✅ API `/api/tenant/ai` (GET katalog+active+BYOK status+usage rollup; PATCH set active) + `/api/tenant/ai/credentials` (POST/DELETE BYOK terenkripsi) — RBAC-guarded
- ✅ UI `/settings/ai` — pilih model aktif per provider, input BYOK key, kartu pemakaian (panggilan/token/biaya); dilink dari Settings
- ✅ `draft-message` di-wire ke `meteredGenerateText` (per-tenant model + metering), fallback template
- ✅ Diuji: GET (8 model/4 provider), set active opus48↔deepseek, BYOK save/verify/delete, rep PATCH 403, page 200, draft fallback 200
- ⬜ Wire route AI lain (chat streaming, autopilot) + admin cost dashboard lintas-tenant → Fase 8

### Fase 4 — Acquisition + positioning 🟡
**Slice 1 (ingest + positioning engine) — selesai:**
- ✅ Schema: `crawl_job`, `ingest_batch`, `positioning_insight` (tenant-scoped + RLS); sample product `prod_maira` di-seed
- ✅ `/api/ingest` (zod, **idempotent** dedup via stable-id → upsert company/person/contact_point + ingest_batch) — RBAC `data.write`
- ✅ Positioning engine `lib/positioning/engine.ts`: AI via registry (`meteredGenerateText`, JSON terstruktur + grounded) **+ heuristic fallback**; `/api/db/positioning` POST(generate)+GET(read)
- ✅ Diuji: ingest count 3 + idempotent (re-ingest tetap 1 company), positioning `fitScore 83` grounded (Logistik∈ICP), stored & read

**Slice 2 / Fase 6 — belum:** MCP server crawl nyata + Chrome extension RPA + discovery entry-points UI (URL/bidang/bulk/auto) + posture enforcement + cascade; wire `ProspectSheet` ke insight tersimpan

### Fase 5 — Engagement 🟡
**Slice 1 (mailbox + send pipeline SMTP) — selesai:**
- ✅ Schema: `sending_account` (config SMTP terenkripsi), `email_template`, `send_job` (queue), `suppression` — tenant-scoped + RLS
- ✅ Pipeline `lib/mail/`: `smtp` (nodemailer) + send worker (DB-queue, suppression + daily-cap + footer unsubscribe) + suppression helper
- ✅ API: `/api/tenant/mailboxes` (connect SMTP/list/delete), `/api/tenant/sends` (enqueue+process), `/api/unsubscribe` (public)
- ✅ UI: `/settings/mailboxes` (connect SMTP + kirim test + riwayat) + halaman publik `/unsubscribe`; dilink dari Settings + middleware allow `/unsubscribe`
- ✅ Diuji: connect, unsubscribe→suppression, kirim ke suppressed→**skipped**, ke normal→**failed** (no delivery), page 200
- ⚠️ **Kirim NYATA butuh creds SMTP valid** — `GMAIL_USER`/`GMAIL_APP_PASSWORD` di `.env.local` masih kosong; isi atau connect mailbox via UI

**Slice 2 — belum:** OAuth Gmail/MS connect + platform ESP; Inngest worker (gantiin proses inline); deliverability (SPF/DKIM/warmup/bounce webhook); cadence multi-channel pakai mailbox + AI personalize

### Fase 6 — Chrome extension RPA 🟡
**Slice 1 (extension scaffold + token-ingest seam) — selesai:**
- ✅ Token-auth di `/api/ingest`: header `x-ingest-token` (= `LINKEDIN_INGEST_TOKEN`, map ke `LINKEDIN_INGEST_TENANT`) → sync tanpa session; selain itu butuh session + `data.write`
- ✅ Extension MV3 di `extension/`: `content.js` (scrape LinkedIn search DOM → leads), `background.js` (buffer chrome.storage + flush rate-limited/jitter 60–120s + daily cap + consent gate `aggressive`), popup (config/posture/consent/scan/flush/status), README
- ✅ Diuji seam: sync via token (no session) → ok count 2; token salah/no-token → 401; data landing deduped (PT Linked Test `source=extension`, Siti Aminah)
- ⚠️ DOM scraping LinkedIn nyata belum diuji (butuh browser + sesi LinkedIn); selector best-effort, perlu tuning live. `LINKEDIN_INGEST_TOKEN` di-generate ke `.env.local` (set juga di Vercel)

**Slice 2 — belum:** MCP server crawl server-side; discovery entry-points UI (URL/bidang/bulk/auto) + cascade; posture enforcement per-tenant + audit_log konsen

### Fase 7–8
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
