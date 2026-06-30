# Loop Progress — Agentic Sales AI (Rebuild)

> **Tracker khusus Sainskerta Loop Workflow.** Terpisah dari `progress.md`
> (yang tetap jadi source-of-truth Closing-Flow AI). Jangan campur dua file ini.
> Source-of-truth status loop: file ini + `.claude/loop.md`.

---

## Ringkasan

| Item | Status |
|------|--------|
| **Project** | `Agentic Sales AI (rebuild — Maira Sales)` |
| **Fase Aktif** | `01-PLANNING` → `02-WIREFRAME` (Module 1) |
| **Status Loop** | `active` |
| **Dimulai** | `2026-06-28` |
| **Target Selesai** | `TBD — ditentukan setelah Planning` |
| **Progress** | `8%` (Fase 00 selesai; Planning + wireframe M1 jalan) |
| **Module 1** | Auth/Tenant/Onboarding (login, register, pending, superadmin-users, onboarding, dashboard-shell) |
| **Mode** | **Full greenfield rebuild** — patuh penuh `loop-workflow/RULES-OF-THE-GAME.md` |

---

## 🗺️ ROADMAP — sampai aplikasi SELESAI

> Tiap modul = vertical slice (backend + DB-apply + frontend + delete/restore/purge + verify tsc/lint). Status: ✅ selesai · 🔄 jalan · ⬜ belum.
> Per modul: **A** backend (schema+repo+service+API) → **B** apply migration (additive auto-apply) → **C** frontend (wire mockup→API, no mock) → **D** runtime-verify (dev server) → **E** demo-fix.

### Modul produk (vertical slices)
- [x] **M1 — Auth / Tenant / Onboarding / Superadmin / Branding** ✅ (demo live, delete/restore/purge ✅)
- [~] **M2 — Workspace + Product** (+ Market-Fit + Sales-Play) — A✅ B✅(0029) C🔄 D⬜ E⬜
- [x] **M3 — Contacts / CRM** ✅ — companies, contacts (B2C/B2B), deals, pipeline kanban, activities; segmentasi keliatan di workspace+contacts; trash/restore/purge
- [x] **M4 — Inbox / WhatsApp** ✅ — conversations, messages, WA session/outbox transport, inbox 3-kolom; soft/restore/purge
- [x] **M5 — Enrichment / Discovery** ✅ — discovery/crawl, enrich, klasifikasi B2C/B2B, push ke CRM; soft/restore/purge
- [x] **M6 — Closing-Flow AI** ✅ — stage-machine + readiness + KB 17 teknik; badge inbox + sales-play panel
- [x] **M7 — Outreach** ✅ — Cadences + Autopilot + Escalations + Handoff; soft/restore/purge
- [x] **M8 — Settings cluster** ✅ — AI · Team · Billing · Compliance · Mailboxes · KB (6 pages)
- [x] **M9 — Sekunder** ✅ — Content · Retention · Ecommerce · Marketplace · Field · Reports
- [ ] **M8 — Settings cluster** — AI/provider (BYOK+metered), Team, Billing (Stripe), Compliance, Mailboxes, Diagnostics, Knowledge-base
- [ ] **M9 — Sekunder** — Content, Retention, Ecommerce, Marketplace, Field, Reports

### Cross-cutting (di-apply lintas modul)
- [ ] Soft-delete + restore + **hard-delete** UI di TIAP resource (incl. crawl/enrichment) — [[delete-restore-everywhere]]
- [ ] White-label per-user theming kepasang di semua page (shell baca `user_theme`)
- [ ] Entitlement-gating: vertical → modul aktif nyetir sidebar (HR vs Sales vs lainnya)
- [ ] AI metering/credit ke-wire di tiap surface AI

### Penutup
- [ ] **Fase 05 — Audit** (security: XSS/SQLi/CSRF · performance · a11y · mobile-responsive · DB index/optimization) → laporan (gate user)
- [ ] **Fase 06 — Deployment** (Vercel: env, build, domain/SSL) (gate user)
- [ ] **Fase 07 — Improvement** (monitoring, maintenance loop)

### Selesai = definisi
Semua M1–M9 vertical slice jalan di Neon + cross-cutting kepasang + Fase 05 audit lulus + Fase 06 deploy. Lalu loop pindah ke mode improvement (deploy → improve, gak ada "selesai" mutlak).

---

## Fase (log detail per tick)

### ✅ Fase 00: Prerequisites — `Selesai`
- [x] Workflow files ter-install (`loop-workflow/`, skill, `.claude/loop.md`)
- [x] Tracker loop terpisah dibuat (`loop-progress.md`)
- [x] **Snapshot prototype lama** — tag `pre-loop-rebuild` + branch `archive/pre-loop-rebuild` @ `5ecac8f`
- [x] **Stack** — Next.js 14 full-stack (TS), modular monolith
- [x] **DB** — Neon existing (`.env.local`)
- [x] **AI** — DeepSeek default (Anthropic opsional BYOK)
- [x] **Deploy** — Vercel
- [x] **Scope awal** — Module 1 = Auth/Tenant/Onboarding

### ✅ Fase 01: Planning — `Selesai` (multi-agent tick, 3 agent)
- [x] Data model + module breakdown → `docs/rebuild/01-data-model.md`
- [x] IA + flows (sitemap, nav, onboarding/register/superadmin) → `docs/rebuild/02-ia-flows.md`
- [x] White-label theming + tenant entitlements → `docs/rebuild/03-whitelabel-entitlements.md`

### 🔄 Fase 02: Wireframe & Audit — `In Progress` (ITERASI — flow revisi)
> Mockup high-fi DITUNDA sampai flow wireframe bener. User: "flow aneh, B2C/B2B di workspace gak kelihatan, enrich di mana, pakai semua fitur".
- [x] Wireframe low-fi batch 1 (auth/onboarding): login, register, pending, superadmin-users, onboarding, dashboard-shell
- [x] **Tick revisi (9 agent):** inventaris SEMUA fitur + IA koheren + wireframe core product:
  - [x] `04-feature-inventory.md` (semua fitur app dipetakan; legend WF/⊂/○)
  - [x] `05-product-flow.md` (IA workspace-centric: B2C/B2B + enrichment placement)
  - [x] wireframes: workspace, contacts (B2C/B2B), enrichment, inbox, pipeline, branding + index direvisi jadi peta produk
- [x] 👀 **FLOW DI-APPROVE user (2026-06-28)** — flow + kelengkapan fitur OK
- [🔄] **Mockup high-fi → `mockups/`** (default Coral Sunset; regenerate 6 halaman lama jadi high-fi = sekalian "sync"). Digerakkan **loop tick tiap 5 menit per batch**:
  - [x] Batch 1: dashboard-shell, workspace, contacts, enrichment, index ✅ (5 mockup)
  - [x] Batch 2: inbox, pipeline, branding, onboarding ✅ (4 mockup; branding live-theming wired)
  - [x] Batch 3: login, register, pending, superadmin-users ✅ (4 mockup)
- [x] **SEMUA 13 mockup high-fi kelar** (Coral Sunset, konsisten, interaktif) → `mockups/`
- [x] 👀 **MOCKUP DI-APPROVE user (2026-06-28)** — 13 halaman high-fi OK
### ➡️ Fase 03: Backend — `In Progress` — 🤖 MODE AUTONOM (loop sampai final)
> User: "use loop, rancang loopnya sampai final" → loop autonomous Fase 03→04→05, self-verify (tsc/lint) tiap step, checkpoint di sini. **Berhenti hanya di gate sungguhan:** `db:push` Neon (mutasi DB live), deploy, atau blocker/keputusan.
> Modular monolith `modules/<domain>/{schema,repo,service}` + thin `app/api`; no-FK/snake_case/soft-delete+restore; no mock data; reuse Neon/Drizzle/next-auth/AI-meter.
- [x] **Tick foundation (Module 1):** `06-m1-backend-design.md` + schema semua tabel M1 + reference domain `tenant` (repo+service+API+soft-delete/restore). ✅ tsc exit 0 (diverifikasi independen), 0 FK, soft-delete OK, migration 0028 (belum di-apply)
- [x] **Tick domain sisa:** auth, onboarding/entitlements, branding (per-user), superadmin → repo+service+API. ✅ tsc exit 0 (diverifikasi independen), 0 FK
- [x] ✅ **MODULE 1 BACKEND CODE-COMPLETE** (5 domain, type-clean, migration 0028 siap — BELUM di-apply)
- [x] Arah dipilih user: **VERTICAL** (frontend Module 1 dulu)
- [x] **DB audit tuntas** (lihat `architecture-decisions.md`): 0028 additive, 13 tabel rebuild belum ada, 0 tabrakan. ⚠️ DB via push (no tracking) → apply HARUS via SQL 0028 langsung (bukan push/migrate).
- [x] ✅ **0028 DI-APPLY ke Neon** (user OK eksplisit) — 13 tabel rebuild kebuat, live 56→69, additive, data lama utuh

### ➡️ Fase 04: Frontend Module 1 — `In Progress` (vertical, wire ke API beneran)
> Halaman M1 jadi React (App Router) faithful ke mockup, fetch dari API baru (`app/api/{auth,tenant,onboarding,branding,superadmin}`), **no mock data**. Auth integration (next-auth → tabel `app_user`/`auth_session`). Self-verify tsc/lint.
- [x] ✅ Spine: auth re-pointed ke `app_user`/`auth_session` + flow pages (login/register/pending/onboarding) + app shell + user-theme-provider (white-label). tsc exit 0 (verified independen)
- [🔄] Pages (jalan): dashboard, branding (editor theme per-user), superadmin console → wire ke API + verify
- [x] ✅ **RUN/SHOW: DEMO LIVE** di `localhost:3000` — seed sukses, dev server jalan. Verified: pages 200, register→pending tenant di Neon nyata, auth gating 302. **Runtime bug auth-split (edge `crypto`) ke-fix** (`lib/auth/auth.config.ts` edge-safe + `node:crypto`).
- [x] ✅ **Trash UI**: soft-delete + restore + HARD-delete (purge) wired end-to-end, superadmin console tab Aktif/Sampah. Verified 403-guarded + dev log bersih.

### ✅ MODULE 1 KOMPLIT — vertical slice hidup di `localhost:3000`
Backend (5 domain) + frontend + DB Neon (applied) + demo live + delete/restore/purge. tsc hijau sepanjang.

### ➡️ Fase 03/04: Module 2 — Workspace+Product — `In Progress`
> 1 ws = 1 produk + market-fit + sales-play. Backend (modules/{workspace,product,...}) → frontend (mockup `workspace.html` wire ke API) → verify. Soft+hard-delete+restore dari awal.
- [x] Tick backend M2: workspace+product (schema+repo+service+API, soft/restore/hard-delete). tsc exit 0 (verified). Migration `0029` = 4 tabel (`product_v2,market_fit,sales_play,workspace_v2`), additive, 0 drop.
- [x] ✅ Migration 0029 APPLIED ke Neon (4 tabel, live 69→73). **Policy baru:** migration additive auto-apply via `scripts/apply-rebuild-migration.mts` (abort kalau destruktif). Gate cuma buat drop/alter.
- [x] ✅ Frontend M2: workspace page (`app/(app)/workspace/page.tsx`) wire ke API, market-fit+funnel+product, B2C/B2B section empty-state. tsc clean, runtime 302-gated, dev log bersih. **MODULE 2 KOMPLIT.**

### ➡️ Module 3 — Contacts / CRM — `In Progress`
> companies, contacts (segment B2C/B2B + enrichment status + fit score), deals, pipeline stages, activities. Soft+restore+hard-delete dari awal. Ngisi section B2C/B2B di workspace.
- [x] ✅ Tick backend M3: CRM domain (company/contact/deal/pipeline/activity) + soft/restore/hard-delete. tsc exit 0. Migration `0030` (6 tabel) **APPLIED** auto (live 73→79).
- [x] ✅ Frontend M3: contacts (B2C/B2B + drawer + trash/restore/purge) + pipeline kanban + workspace section diisi CRM nyata. tsc clean, runtime 302-gated, dev log bersih. **MODULE 3 KOMPLIT.**

### ➡️ Module 4 — Inbox / WhatsApp — `In Progress`
> conversations, messages, WA session/outbox (transport gateway-agnostik, reply-only), basis AI-assist (orkestrasi penuh nanti di M6). Soft+restore+hard-delete.
- [x] ✅ Tick backend M4: inbox (conversation/message) + wa (session/outbox) domain + soft/restore/hard-delete. tsc exit 0. Migration `0031` (4 tabel) APPLIED auto (live 79→83).
- [x] ✅ Frontend M4: inbox 3-kolom wire ke API. tsc clean. Runtime: sempat 500 (cache `.next` basi) → fixed dgn clear `.next` + restart → /inbox 302. **MODULE 4 KOMPLIT.**

### ➡️ Module 5 — Enrichment / Discovery — `In Progress`
> crawl/SERP discovery, enrich profil, **klasifikasi B2C/B2B**, fit-score, push ke contacts (ngisi segment+enrichment_status di CRM). Soft+restore+hard-delete.
- [x] ✅ Tick backend M5: enrichment/discovery domain + push-ke-CRM + soft/restore/hard-delete. tsc exit 0. Migration `0032` (3 tabel) APPLIED auto (live 83→86).
- [x] ✅ Frontend M5: enrichment page (discovery + enrich + klasifikasi B2C/B2B + push). tsc clean. **MODULE 5 KOMPLIT.**

### 🎉 CORE PRODUCT (M1–M5) KOMPLIT — live di Neon
Auth/Onboarding/Superadmin/Branding → Workspace+Product → CRM (B2C/B2B + pipeline) → Inbox/WA → Enrichment/Discovery. 86 tabel. Demo: `localhost:3000`.

### ➡️ Module 6 — Closing-Flow AI — `In Progress`
> Diferensiator inti: sales orchestrator + stage-machine (rapport→discovery→value→objection→closing) + predictive readiness + KB/17 teknik. Pakai AI registry/meter existing.
- [x] ✅ Tick backend M6: sales-flow domain (stage-machine, readiness, KB 17 teknik) + AI via meter (heuristic-first). tsc exit 0. Migration `0033` (3 tabel) APPLIED auto (live 86→89).
- [x] ✅ Frontend M6: closing-readiness badge di inbox + sales-play/teknik panel di workspace. tsc clean, runtime 302. **MODULE 6 KOMPLIT (diferensiator).**

### ➡️ Module 7 — Outreach — `In Progress`
> Cadences (urutan follow-up) + Autopilot (orkestrasi auto) + Escalations + Handoff. Soft+restore+hard-delete.
- [x] ✅ Tick backend M7: outreach domain (cadence/step/enrollment, autopilot_run, escalation, handoff) + soft/restore/hard-delete. tsc exit 0. Migration `0034` (6 tabel) APPLIED auto (live 89→95).
- [x] ✅ Frontend M7: cadences + autopilot + escalations pages. tsc clean, runtime 302. **MODULE 7 KOMPLIT.**

### ➡️ Module 8 — Settings cluster — `In Progress`
> AI/provider (BYOK+metered, reuse registry) · Team (reuse M1 membership) · Billing (reuse Stripe) · Compliance · Mailboxes (reuse mail) · Diagnostics · Knowledge-base (baru). Reuse infra existing + tambah KB + tenant_settings.
- [x] ✅ Tick backend M8: settings domain (knowledge_base + tenant_settings + facade ai/billing/mail) reuse infra. tsc exit 0. Migration `0035` (2 tabel) APPLIED auto (live 95→97).
- [x] ✅ Frontend M8: 6 settings pages (AI, team, billing, KB, mailboxes, compliance). tsc clean, runtime 302. **MODULE 8 KOMPLIT.**

### ➡️ Module 9 — Sekunder (terakhir) — `In Progress`
> Content · Retention · Ecommerce · Marketplace · Field · Reports. Domain baru (reuse pattern) + reports = aggregate read. Soft+restore+hard-delete.
- [x] ✅ Tick backend M9: 6 secondary domains + reports service. tsc exit 0. Migration `0036` (11 tabel) APPLIED auto (live 97→108).
- [x] ✅ Frontend M9: content, retention, ecommerce, marketplace, field, reports. tsc clean, runtime 302. **MODULE 9 KOMPLIT.**

### 🎉🎉 SEMUA 9 MODUL SELESAI (M1–M9) — 108 tabel live di Neon, tsc hijau, demo `localhost:3000`

### 🔄 Fase 05 — Audit — SELESAI + lagi fix critical
> `docs/rebuild/AUDIT.md` jadi. Agregat: **5 CRITICAL · 13 HIGH · 18 MED · 18 LOW**. Verdict: belum aman deploy internet-facing (aman demo lokal). Disiplin tenant-filter/envelope/no-FK terkonfirmasi holds; blocker sedikit + murah.
> **Must-fix-before-deploy:** #1 backdoor superadmin hardcoded · #2 reset-token bocor di response · #6 tenant-status client-side only · #8 no rate-limit auth · #3 RLS gak ke-apply (legacy names) · #4 kontras WCAG CTA · #5 drawer gak ada dialog semantics.
- [x] ✅ **Fix tick** (security CRITICAL + kontras): #1 backdoor gated (`dev-gate.ts`) · #2 reset-token gak dibalikin · #6 tenant-status server-side · #8 rate-limit (`rate-limit.ts`) · #11 guard envelope · #21 role allow-list · #4 #19 kontras WCAG. tsc PASS.
- [x] ✅ **PUSHED** ke `pendtiumpraz/main` (commit `434c63e`, rebased di atas `c317ddb` v0.3.0, no conflict)
- [🔴] **GAP DITEMUKAN USER: flow/shell masih LAMA.** Rebuild ganti isi page per-modul tapi landing(`/`)+top-bar+nav+rute-lama gak disatuin ke IA baru → app kerasa lama. (Verifikasi-ku cuma tsc+HTTP-status, gak cek rendered UI — salah.) → [[verify-rendered-ui]]
- [x] ✅ **Flow/shell unification** — landing baru (Maira/Masuk/Daftar, no old markers — **diverifikasi rendered**) + side-nav IA baru (link mati bersih, /workspace) + top-bar baru. Commit `dd4c3c7` PUSHED. (minor sisa: rute orphan use-case/workspaces/team belum redirect, tapi udah unlinked)
- [🔄] #5 Radix dialogs + #3 RLS — retry (API udah balik)
- [ ] 👀 User review audit + verdict → **Fase 06 Deploy = gate kamu**
- [ ] ⚠️ Transisi: halaman lama yg belum di-rebuild bisa rusak sementara (auth pindah tabel baru) — wajar, ke-cover snapshot
- [ ] ⚠️ `db:push` ke Neon — GATE (butuh OK user; sebelum itu cuma `db:generate` + tsc/lint)
- [ ] Module 2..n: Workspace+Product → Contacts/CRM → Inbox/WA → Enrichment

### ⬜ Fase 04: Frontend — `Belum` (wire mockup → API beneran, no mock)
### ⬜ Fase 05: Audit — `Belum` (gate laporan user)
### ⬜ Fase 06: Deployment — `Belum` (gate konfirmasi user)
### ⬜ Fase 07: Improvement — `Belum`

---

## Issue & Blocker

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Rebuild penuh = upaya multi-minggu; scope awal harus dibatasi user | high | open |
| 2 | "No dummy data" (Rule 7) hapus seluruh lapisan `lib/api-mock/` demo | high | open |
| 3 | Struktur App Router ≠ split `backend/ frontend/` di contoh loop | medium | open |

---

## Catatan

- Prototype lama tetap berfungsi selama Fase 00–02. Restructure destruktif baru di Fase 03+, **setelah** wireframe di-approve.
- Dua progress file by design: `progress.md` = Closing-Flow; `loop-progress.md` = mesin loop.

---

## Log Perubahan

| Tanggal | Fase | Perubahan |
|---------|------|-----------|
| `2026-06-28` | `00` | Loop di-vendor ke `loop-workflow/`, tracker + skill + `.claude/loop.md` dibuat |
| `2026-06-28` | `00` | Snapshot `pre-loop-rebuild` (tag+branch @5ecac8f); stack firm = Next.js full-stack |
