# Feature Catalog — Maira Sales (Agentic Sales AI)

> **What this is:** a complete, honest inventory of what the platform does **right now**.
> Next.js 14 App Router, Indonesia/WhatsApp-focused, mid **greenfield rebuild** (Sainskerta Loop).
> Grouped by the sidebar IA (`components/layout/side-nav.tsx`): **Utama · Leads · Eksekusi ·
> Lainnya · Pengaturan**, plus **Superadmin** and the cross-cutting **engines** (Closing-Flow
> AI, WhatsApp gateway, Chrome extension, Quota & subscription).

_Last generated: 2026-07-01 (from code, not aspiration). Update when features land. Touched up 2026-07-01 to reflect the served `extension/` collector v0.14.0 (multi-channel + CSV + Deep Enrich + quota render), the mounted Superadmin Secrets/Docs tabs, and the encrypted secrets console._

---

## Legend & how to read this

- **Data source**
  - **rebuild DB** — served by a `modules/*/{service,repo,schema}` domain service through `app/api/**`, tenant-scoped via `TenantContext`/`withTenant`, soft-delete + audit. This is the new modular-monolith. **DB-gated:** without `POSTGRES_URL` the endpoint returns an empty `{ data: [], source: "mock" }` (no faker) — so "mock mode" here means *empty*, not fake fixtures.
  - **legacy DB** — served by the older `lib/db/schema` + `lib/*/store` layer (pre-rebuild). Real, DB-gated, but not the new `modules/*` tables.
  - **still-mock** — hardcoded/static in the page, no backend.
  - **mixed** — read path is a rebuild facade, write/connect path reuses legacy infra routes (or vice-versa).
- **Status** — **Live** = wired end-to-end and usable; **WIP** = stub, placeholder, orphaned, or backend-only with no UI.

> ⚠️ **Rebuild data-model split (important):** **Dashboard** and **Contacts Map** still read the **legacy** `personTable`/`companyTable` (`lib/db/schema`). Everything else in Leads (Kontak, Profiles, Discovery, Enrichment, Workspace) reads the **new** `modules/crm` `contact`/`company_v2` tables. Leads created through the rebuild Discovery/Enrichment flow therefore **do not yet surface on the Dashboard or Map** — a genuine disconnect, not cosmetic.

---

## Utama

### Dashboard
- **Purpose:** Daily overview — lead KPIs, funnel, priority tasks, recent contacts, AI-token quota card.
- **Route:** `/dashboard` (`app/(app)/dashboard/page.tsx`)
- **API / module:** `GET /api/db/people`, `GET /api/entitlements`, `GET /api/tenant/status`
- **Data:** legacy DB (reads `personTable`, not `modules/crm`)
- **Status:** **WIP** — DB-wired and mock-free, but the funnel buckets real people into 5 placeholder stages, "Tugas prioritas" is a derived next-best-contact list (no tasks table yet), and it reads a different table than the rebuild CRM writes.

### Workspace (Closing-Flow hub)
- **Purpose:** Per-workspace sales cockpit — **1 workspace = 1 product** — walking product → market-fit → sales-play → chat.
- **Route:** `/workspace` (`app/(app)/workspace/page.tsx`)
- **API / module:** `/api/workspace` (+ `/[id]/market-fit`, `/[id]/sales-play`), `/api/product`, `POST /api/market-fit`, `/api/sales/techniques`, `/api/contacts?workspaceId=` → `modules/workspace`, `modules/product`, `modules/crm`
- **Data:** rebuild DB (`workspace_v2` + 1:1 satellites `market_fit`, `sales_play`; `product_v2`)
- **Status:** **Live**
- **Notes:** 7-tab hub (Produk / Market-Fit / Funnel / Kontak / Sales Play / Teknik / Lainnya). Create-workspace dialog, connect/create product, inline **Market-Fit Analyzer** (B2B/B2C/mix + confidence + ICP + segment scores), inline **Sales Play editor** (channel/tone/techniques), closing techniques filtered client-side by market type (aggressive = B2C-only), acquired-contacts table with live Semua/B2C/B2B counts. Funnel band is still an honest zero-state placeholder. See **Closing-Flow AI engine** below for the runtime that consumes these configs.

---

## Leads

### Kontak & Lead (CRM)
- **Purpose:** All acquired contacts/leads, B2C/B2B-segmented, with enrichment status + deal/activity history.
- **Route:** `/contacts` (`app/(app)/contacts/page.tsx`)
- **API / module:** `/api/contacts`, `/api/companies`, `/api/taxonomy/{industries,occupations}`, `/api/activities`, `/api/deals` (+ `/trashed`, `/[id]`, `/restore`, `?purge=1`) → `modules/crm`
- **Data:** rebuild DB
- **Status:** **Live** — full CRUD-one-page + right-drawer + soft-delete → Sampah → restore → hard-delete.
- **Notes:** Drawer has AI segment reclassify override, fit-score bar + AI reason, enrichment fields (with source/consent), Aktivitas/Deal/Catatan tabs. Industri/Pekerjaan filters resolve taxonomy soft-ref ids to labels. Caveat: drawer "Edit" and "Catatan" textarea are non-wired stubs.

### Discovery (channel-agnostic graph)
- **Purpose:** Goal-first, channel-neutral lead finding → one Company→People graph, saved to a workspace.
- **Route:** `/contacts/discovery`
- **API / module:** `POST /api/discovery/plan`, `POST /api/discovery` (URL scrape), `POST /api/discovery/ingest`, `GET /api/rep/account` → `modules/enrichment` (`planDiscoveryChannels`, `ingestGraph`)
- **Data:** rebuild DB (`discovery_job`/`result` + CRM upsert)
- **Status:** **WIP (honest)** — AI cross-channel plan, URL-scrape, and the ingest sink are **Live**; the **per-channel browser scrapers are not built**. The plan grid shows explicit Live/WIP badges (LinkedIn/Maps/SERP = Live; IG/FB/marketplace/TikTok = WIP). Graph starts empty and only fills from real scrapes/extension — never fabricated.
- **Notes:** Two entry modes (AI target plan vs paste-any-URL with client-side channel detection). Ingested people land in CRM at `enrichment_status: none`.

### Contact Profiles (Perusahaan & Orang)
- **Purpose:** Separate profiling of Companies (with **industri**) vs People (with **pekerjaan**).
- **Route:** `/contacts/profiles`
- **API / module:** `/api/companies`, `/api/contacts`, `/api/taxonomy/*` (+ trash/restore/purge on both) → `modules/crm` + `modules/taxonomy`
- **Data:** rebuild DB
- **Status:** **Live** — Perusahaan / Orang / Sampah tabs, both open a right drawer, full soft-delete lifecycle.
- **Notes:** Taxonomy id→label resolution with honest fallbacks ("terklasifikasi / mentah / belum diklasifikasi"); drawer links out to Master Data.

### Contacts Map (Peta Sebaran Lead)
- **Purpose:** Province-level lead distribution map (Leaflet) with source/lead-type/skill filters.
- **Route:** `/contacts/map`
- **API / module:** `GET /api/profiles/by-province`; `components/leads/leads-map` (client-only)
- **Data:** legacy DB (aggregates `personTable`, not `modules/crm`)
- **Status:** **WIP** — fully wired + mock-free, but tied to the legacy person table (won't reflect rebuild-CRM contacts); read-only viz, no drawer/soft-delete.

### Enrichment (Pengayaan Data)
- **Purpose:** Queue of raw leads → enrich → auto-classify B2C/B2B + fit score → push to Contacts; plus discovery run history.
- **Route:** `/enrichment` (`app/(app)/enrichment/page.tsx`)
- **API / module:** `GET /api/enrichment`, `POST /api/enrichment/[id]/{run,classify,push}`, `GET /api/discovery/jobs` (+ trash) → `modules/enrichment`
- **Data:** rebuild DB
- **Status:** **Live** (two tabs: Antrian Enrichment / Riwayat, each with Sampah).
- **Notes:** Classify here is a **deterministic offline heuristic** (`classifySignals` — B2B via company/title/business-email signals; fit_score from contactability); the LLM classifier is deferred. One-click "Enrich" runs then auto-classifies; before/after diff drawer with ✦ new-field markers; "Push ke Contacts" writes a CRM contact.

### Master Data (taxonomy Industri & Pekerjaan)  *(nav group: Pengaturan)*
- **Purpose:** The AI-classification catalog — two flat taxonomies (industry / occupation), base ∪ tenant rows, that the AI uses to label crawled companies/people.
- **Route:** `/master-data`
- **API / module:** `/api/taxonomy/{industries,occupations}` (+ `/trashed`, `/[id]`, `/restore`, `?purge=1`, `/merge`) → `modules/taxonomy`
- **Data:** rebuild DB (global seed rows `tenantId NULL` read-only + tenant `ai`/`manual` rows)
- **Status:** **Live**
- **Notes:** Kind tabs (Industri/Pekerjaan) + Antrian review (AI-created rows: approve = promote, reject = soft-delete) + Sampah; create/edit drawer, merge-into, full soft-delete lifecycle. **This is the one place classify actually calls the metered LLM** (`taxonomyService.classify` → `meteredGenerateText`), degrading to unclassified on failure. Honest gap: the "Dipakai" usage-count column shows "belum terlacak" (no join yet).

---

## Eksekusi

_All six pages are wired to the rebuild backend (`{ok,data}` envelope, `requirePermission` + `hasDb()` gating); none import `lib/api-mock/`. Every page implements the standard **soft-delete → Sampah → restore → hard-purge** pattern (quotes = restore-only exception)._

### Inbox (omni-channel)
- **Purpose:** Unified 3-column WhatsApp/email conversation workspace (list + thread + context panel).
- **Route:** `/inbox` (`app/(app)/inbox/page.tsx`)
- **API / module:** `/api/conversations*`, `/api/messages`, `/api/contacts`, `/api/deals`, `/api/wa/mode`; AI composer via `/api/auto-reply`, `/api/draft-message` → `modules/inbox` (+ `modules/crm`)
- **Data:** rebuild DB
- **Status:** **Live**
- **Notes:** WA reply-mode toggle (auto vs semi/draft-approve) persisted per-tenant; per-conversation **closing-readiness badge**; B2C/B2B segment override; soft-delete cascades to messages.

### Pipeline / Deals
- **Purpose:** Per-tenant CRM kanban of deals by stage with AI hot-lead signal.
- **Route:** `/pipeline`
- **API / module:** `/api/pipeline`, `/api/pipeline/stages`, `/api/deals*`, `/api/contacts` → `modules/crm`
- **Data:** rebuild DB
- **Status:** **Live**
- **Notes:** Move-stage / mark-won via right drawer (not drag-drop); workspace-scoped + B2C/B2B filter; "panas" hot badge from contact `fitScore ≥ 0.8`.

### Penawaran / Quote
- **Purpose:** Quote-to-cash — AI drafts items/cover email, send via mailbox, public page tracks viewed/accepted.
- **Route:** `/penawaran` (list), `/penawaran/[id]` (editor); public `/q/[token]`
- **API / module:** `/api/quotes*`, `/api/quotes/[id]/send`, `/api/quotes/compose`, `/api/public/quote/[token]` → **`lib/quotes/store`** (older DB store, predates `modules/*`)
- **Data:** rebuild DB (real DB-gated store; returns `[]` when no DB)
- **Status:** **Live**
- **Notes:** **Public quote token link** `/q/<token>` (no-auth; GET marks viewed, POST accept/reject). **AI compose** (metered) drafts items + cover. Lock-after-send (server enforces 409 on commercial edits). Honest gap: soft-delete + restore only, **no hard-purge** for quotes.

### Cadence
- **Purpose:** Ordered, cross-channel (WA/Email/Call) auto follow-up sequences with per-step delay + template.
- **Route:** `/cadences`
- **API / module:** `/api/cadences*` (`[id]`, `steps`, `enrollments`, `enroll`, `advance`, restore/purge) → `modules/outreach`
- **Data:** rebuild DB
- **Status:** **Live** (definition + enrollment). Caveat: the step **processor** that actually fires due steps is a separate endpoint (`/api/cadences/process`, `advance`); `nextRunAt` is computed but automated dispatch is not driven from this UI.
- **Notes:** **Enroll leads** — multi-select contact picker schedules step 0; inline step editor; soft-delete cascades to steps + enrollments.

### Autopilot (AI orchestration)
- **Purpose:** Ledger of AI orchestration "runs" over conversations/contacts — status, duration, per-step log trace.
- **Route:** `/autopilot`
- **API / module:** `/api/autopilot*` (`[id]`, `trashed`, `restore`, `purge`, `text`), `/api/auto-reply` → `modules/outreach` (`autopilot_run_v2`)
- **Data:** rebuild DB
- **Status:** **WIP (honest)** — the run records + start/inspect/trash surface is Live and DB-backed, but the page only *records* a `queued` run and *displays* logs; the actual lifecycle (status transitions, step execution) is driven by the AI orchestrator elsewhere and **not wired from this surface**. Starting a run does not autonomously execute steps.
- **Notes:** Start-run drawer with mode = suggest (human approves) vs auto; structured log-trace timeline; status filter incl. `escalated` → links to Eskalasi. A client-side **"Ekspor CSV"** of run prospect journeys exists (`components/autopilot/run-results.tsx`). (The browser extension also exports crawled leads to CSV — see Chrome extension.)

### Eskalasi / Handoff
- **Purpose:** Human-takeover queue for AI-escalated conversations (objection/pricing/complaint/low-confidence → hand to a person).
- **Route:** `/escalations` (queue); `/settings/handoff` (config, superadmin-gated)
- **API / module:** `/api/escalations*`, `/api/handoff*` (`claim`, `complete`, restore/purge), `/api/team/members`; config via `lib/stores/handoff-store` (DB-hydrated) → `modules/outreach`
- **Data:** mixed (queue = rebuild DB; config = store)
- **Status:** Queue = **Live**; Settings config = **Live**; Settings **"Riwayat Eskalasi" tab = WIP (hardcoded EmptyState stub)**.
- **Notes:** Two guardrail lifecycles — escalation (open→acknowledged→resolved/dismissed) and handoff work-queue (pending→claimed→done) with SLA badges; create-handoff-from-escalation; config exposes the three handoff triggers + auto-reply master switch.

---

## Lainnya

_All six are rebuild-DB, tenant-scoped modular-monolith services with the full soft-delete → restore → purge trash pattern. **Marketplace** and **Laporan** are `managerOnly` (hidden from Sales Rep role). Konten, Retensi, E-Commerce, and Field are **not** managerOnly._

### Konten (Content)
- **Purpose:** Reusable message/content template library + editorial content-planning calendar.
- **Route:** `/content`
- **API / module:** `/api/content/{templates,plans}*` → `modules/content` (`content_template`, `content_plan`)
- **Data:** rebuild DB · **Status: Live**
- **Notes:** `{{variable}}` detection; plans on a month calendar (+ list view); deleting a template cascades to plans that sourced it.

### Retensi & Win-back
- **Purpose:** Automated retention / win-back flows with per-channel step sequences.
- **Route:** `/retention`
- **API / module:** `/api/retention/{flows,steps}*` → `modules/retention` (`retention_flow`, `retention_step`)
- **Data:** rebuild DB · **Status: Live**
- **Notes:** Flow kinds retention/win_back/onboarding/loyalty; triggers (no_activity, churn_risk, cart_abandoned…); right-drawer doubles as flow + inline step editor (WA/email/call/sms · delay days · offer · template).

### E-Commerce
- **Purpose:** Marketplace order ledger + abandoned-cart recovery.
- **Route:** `/ecommerce`
- **API / module:** `/api/ecommerce/{orders,carts}*` (+ `carts/[id]/nudge`, `/recover`) → `modules/ecommerce` (`marketplace_order`, `cart_recovery`)
- **Data:** rebuild DB · **Status: Live**
- **Notes:** **One-click WA cart recovery** — `nudge` records the attempt then opens a pre-filled `wa.me` draft; idempotent ingest on `(channel, external_id)`; channels tokopedia/shopee/tiktok/other.

### Marketplace
- **Purpose (as built):** Connect marketplace stores (Tokopedia/Shopee/TikTok/Lazada) as a **lead source** + manage per-channel product listings.
- **Route:** `/marketplace` (managerOnly)
- **API / module:** `/api/marketplace/integrations*` + `/listings*` (sync, track, restore/purge) → `modules/marketplace` (`marketplace_integration`, `marketplace_listing_v2`)
- **Data:** rebuild DB · **Status: Live** (integrations/listings)
- **⚠️ Honest discrepancy:** the nav label says *"Jual-beli data perusahaan antar-tenant"* (cross-tenant data trading) but **the page does not implement that**. The actual cross-tenant **data-trading** feature is a *separate, older* backend-only API (`/api/marketplace` browse/acquire/bundle/publish/delist, backed by `lib/marketplace/store`, gated by `tenant.members.manage` + `marketplaceEnabled()`, no-op without DB). **No page wires it → data-trading is WIP/backend-only.**

### Sales Lapangan (Field)
- **Purpose:** Field-sales visits with geo-stamped check-in/out.
- **Route:** `/field`
- **API / module:** `/api/field/visits*` (+ `check-ins`), `/api/field/check-ins*` → `modules/field` (`field_visit`, `field_check_in`); resolves contact/company names via `modules/crm`
- **Data:** rebuild DB · **Status: Live** (with caveats)
- **Notes:** Check-in/out drives the visit lifecycle; contact/company links validated through the CRM service. **Map is a placeholder** ("Peta interaktif menyusul"); drawer "Edit" disabled.
- **⚠️ Honest discrepancy:** there is **no `FieldRep.ownerUserId` role-scoping**. Visits carry `repUserId` (defaults to the actor), but `listVisits` returns **all tenant visits** — gated only by tenant permission. A separate **mobile field PWA** exists at `/m` (`/m`, `/m/check-in`, `/m/visits/new`, `/m/contacts`) but it is **still-mock** (hardcoded schedule/mini-map).

### Laporan & Analitik (Reports)
- **Purpose:** Real-time aggregate dashboard over rebuild tables + CRUD for saved-report configs.
- **Route:** `/reports` (managerOnly)
- **API / module:** `/api/reports/overview` (composed) + `/saved*` + per-aggregate routes (`contacts-by-segment`, `deals-by-stage`, `closing-funnel`, `marketplace-sales`, `field-activity`) → `modules/reports` (owns only `saved_report`; rest are live roll-ups)
- **Data:** rebuild DB · **Status: Live**
- **Notes:** Tabs are **Ringkasan · Laporan tersimpan · Sampah**; metrics never fabricated (8 live roll-ups + headline totals); bar charts are styled divs (no chart lib); saved reports carry `ownerUserId` + private/tenant scope + pin.
- **⚠️ Honest discrepancy:** there is **no "Kalibrasi Closing" tab** on the rebuild reports page. `components/analytics/calibration-panel.tsx` exists but is **orphaned** (zero imports). The predictive **outcome/calibration loop** itself is real (see Closing-Flow AI) — it's just not surfaced in Reports.

---

## Pengaturan

### Branding (per-user white-label)
- **Purpose:** Each **user** restyles their own app shell — logo, favicon, brand name, full color-token scheme, raw Custom CSS.
- **Route:** `/branding` (`app/(app)/branding/page.tsx`)
- **API / module:** `/api/branding/theme` (+ `/reset`) → `modules/branding` (`user_theme`, keyed by `user_id`)
- **Data:** rebuild DB · **Status: Live**
- **Notes:** Grain is **per-USER, not per-tenant** (explicit banner). Server-side hex validation, CSS sanitizer (strips `@import`/`expression()`/`javascript:`), hex→HSL + WCAG foreground derivation, audit row. Reset → Coral Sunset defaults.

### Settings hub
- **Purpose:** Profile/workspace band the Settings sub-nav rail hangs off.
- **Route:** `/settings`
- **Data:** still-mock (hardcoded "Maira Sales Indonesia", read-only, explicit "Mode demo" notice)
- **Status:** **WIP** — the only inert page in the Settings cluster; real sub-sections live in sibling routes below.

### AI & Model / BYOK
- **Purpose:** Pick the tenant's **one active model** (all workspaces share it), set per-provider BYOK keys, view current-month usage.
- **Route:** `/settings/ai`
- **API / module:** `GET/PATCH /api/settings/ai`; BYOK via `/api/tenant/ai/credentials` → `modules/settings` (`getAiConfig`/`setActiveModel`) reusing `ai_provider`/`ai_model`/`tenant_active_model`/`ai_credential`/`ai_usage`
- **Data:** rebuild DB · **Status: Live**
- **Notes:** BYOK keys AES-256-GCM encrypted; tenant key overrides platform key. Usage rollup (tokens in/out, cost, calls) windowed to Asia/Jakarta month. Gated on `tenant.settings.manage`.

### Team & Access (RBAC)
- **Purpose:** Manage memberships, roles, seats, pending invites.
- **Route:** `/settings/team` (managerOnly)
- **API / module:** `/api/team/members`, `/api/tenant/members*` (+ `invites/[id]`) → `modules/tenant` (`membership`)
- **Data:** rebuild DB · **Status: Live**
- **Notes:** Invite by email (7-day copy-link), role change, **seat disable/enable** (keeps data), remove, revoke invite. Self-lockout blocked; `superadmin` never assignable from tenant UI; `addMembership` enforces the plan **seat ceiling** (402 when full). Invite acceptance lives at public `/invite/[token]`.

### Billing, Quota & Packs
- **Purpose:** AI-credit balance, active plan, usage-vs-quota meters, 30-day top-up packs, subscription upgrade/portal.
- **Route:** `/settings/billing` (managerOnly)
- **API / module:** `GET /api/settings/billing` (facade) + `/api/tenant/billing`; `/api/billing/quota/{packs,buy}`; `/api/billing/{checkout,portal}` → `modules/settings` (`getBillingSummary`) reusing `lib/billing/credit.ts` + `stripe.ts`
- **Data:** mixed · **Status: Live**
- **Notes:** 5 tabs (Kredit AI · Paket · Pemakaian · Beli Kuota · Langganan). See **Quota & subscription** below for the full model. Credit enforcement is **opt-in** (`CREDIT_ENFORCED`, off by default → AI keeps running).

### Extension (WhatsApp + Discovery bridge)
- **Purpose:** Download the Chrome extension, register the rep's per-rep ingest token + platforms, connect WhatsApp.
- **Route:** `/settings/extension`
- **API / module:** `/api/rep/account` (GET/PATCH/regenerate), `/api/extension/status`, `/api/tenant/integration-token`; WA via `WaConnectCard`
- **Data:** rebuild DB (per-rep account + heartbeat) · **Status: Live**
- **Notes:** Two-layer connection state — server heartbeat ("terhubung") + a `window.postMessage` handshake with the extension ("terpasang di browser ini"). Per-rep token attributes crawled leads to that rep; regenerate invalidates. See **Chrome extension** below.

### Knowledge Base
- **Purpose:** Per-tenant grounding articles the AI reads (product/objection/persona/compliance/general).
- **Route:** `/settings/knowledge-base`
- **API / module:** `/api/settings/kb` (+ `/trashed`, `/[id]`, `/restore`) → `modules/settings` (owns `knowledge_base`)
- **Data:** rebuild DB · **Status: Live**
- **Notes:** Full CRUD + soft-delete → Sampah → restore / type-to-confirm hard-purge; scope filter, pin-to-prioritize, tags; every mutation audited. (Distinct from the seeded **17 closing techniques** KB — see Closing-Flow AI.)

### Compliance / UU PDP
- **Purpose:** PDP No. 27/2022 control toggles + DSAR (export/delete) + retention purge + audit trail.
- **Route:** `/settings/compliance`
- **API / module:** `GET/PATCH /api/settings/compliance` (`tenant_settings` k/v); DSAR/audit via `/api/tenant/compliance`
- **Data:** rebuild DB · **Status: Live**
- **Notes:** Compliance score derived deterministically from saved controls (never stored). DSAR export→JSON; cross-table erase (opt-out retained); retention purge of `ai_usage`/`send_job`/`crawl_job`. Page-gated to DPO roles; writes gated to `tenant.settings.manage`.

### Mailboxes
- **Purpose:** Connected sending identities (SMTP app-password / Gmail·MS365 OAuth / platform ESP) with per-day send counters.
- **Route:** `/settings/mailboxes`
- **API / module:** `GET /api/settings/mailboxes` (facade) → `modules/settings` (`sending_account`); connect/disconnect reuse `/api/tenant/mailboxes` (+ `esp`, `oauth/{google,microsoft}/start`)
- **Data:** mixed · **Status: Live**
- **Notes:** "Sent today" computed from the send log on the Asia/Jakarta day (matches the send-worker cap). Quick-connect buttons appear only for env-wired providers (`GOOGLE_OAUTH_*`/`MICROSOFT_OAUTH_*`/`RESEND_API_KEY`); passwords AES-256-GCM encrypted. Email transport is **server-side** (no extension needed).

### Diagnostics
- **Purpose:** Verify Deepseek/DB/runtime wiring, live-ping AI, probe which routes fall back to mock.
- **Route:** `/settings/diagnostics` (superadmin-gated)
- **API / module:** `/api/diagnostics`, `/api/diagnostics/ai-ping`; probes `/api/chat`, `/api/auto-reply`, `/api/kb-test`, `/api/autopilot/text`
- **Data:** live env/DB introspection · **Status: Live**
- **Notes:** Reads each route's `source` discriminator (`real`/`mock`/`error`), incl. the `x-ai-source` header on the streaming chat route, to pinpoint mocking surfaces.

---

## Superadmin (platform console)

### Superadmin Console
- **Purpose:** Cross-tenant management — provision, activate, suspend, top-up, trash.
- **Route:** `/admin` (`app/admin/page.tsx`, brand-neutral shell outside the white-label; gated to `session.user.role === "superadmin"`)
- **API / module:** `/api/superadmin/{overview,tenants,provision}`, `/api/superadmin/tenants/[id]/activation`, `/api/tenant/[id]/{suspend,quota,restore}`, `/api/tenant/trashed` → `modules/superadmin` + `modules/tenant`
- **Data:** rebuild DB · **Status: Live**
- **Wired now:** "Buat akun" provisions **tenant + first admin `app_user` + owner membership** in one call; activation drawer sets **duration** (1/3/6/12-mo chips or date) + **AI-token quota**; "+ Kredit" adds 1M to `ai_tokens_max`; **suspend** kill-switch; soft-delete → Sampah → restore / slug-typed hard-purge; KPI strip (tenants/pending/users/audit).
- **Secrets & Config + Dokumentasi tabs (Live):** the console now mounts a **"Secrets & Config"** tab — superadmin-managed, **AES-256-GCM-encrypted** platform secrets/config via `/api/superadmin/secrets` + `lib/config/secrets.ts` (a ~35-key catalog grouped by category: AI / Payment / Email / Ingest & WA / Jobs / Flags), values **masked**, inline edit, DB/env/kosong source badge, and a "SECRETS_KEY missing" warning. Resolution is **DB (decrypt) → env fallback**, cached 60s; the callers for the AI key, Midtrans/Stripe-webhook, and WA/ingest tokens read via `getSecret`. Plus a **"Dokumentasi"** tab (architecture reference → `docs/HLA.md` / `docs/FEATURES.md`).
- **⚠️ Still not wired in the console:** **module entitlements, deployment-mode, and wa-mode** have live DB-backed routes (`/api/admin/{entitlements,deployment-mode,wa-mode}`) **and** components (`components/admin/{entitlement-matrix,deployment-mode-toggle,wa-mode-toggle}.tsx`) but **nothing renders them** — orphaned relative to the rebuilt console. The **payment-provider** setting (`/api/superadmin/payment-provider`) is live but set via API (no dedicated console toggle yet). Note: tenant entitlements *are* consumed — the sidebar hides modules the superadmin disabled via `/api/tenant/entitlements`.

---

## Engine: Closing-Flow AI

> The consultative, value-first conversation runtime that powers Workspace + Autopilot + the WhatsApp brain. **1 workspace = 1 product.** See `progress.md` (root) for the living tracker.

- **Stage machine** — `lib/sales/stage-machine.ts`. Deterministic/regex, **no AI cost**. Stages `rapport → discovery → value → objection → closing`. Detects 5 Indonesian signals (need / value / price-asked / objection / closing-intent); objection outranks closing; closing is sticky. `decide()` returns `{ stage, priceGateOpen, nextAction, guidance }`; a separate handoff regex (komplain/refund/tipu/"bicara manusia"/lawyer) forces `nextAction="handoff"`.
- **17 closing techniques** — `lib/kb/closing-techniques.ts`. Exactly **17** (`CLOSING_TECHNIQUES_17`, Dewa Eka Prayoga). Each `{ id, nama, inti, contohSkrip?, cocokUntuk:(B2B|B2C)[], sinyalPemicu[] }`. Aggressive ones (Kelangkaan, Now-or-Never, Harga Coret, Machine Gun…) tagged **B2C-only**; `formatClosingTechniques({market})` filters so B2B never gets them. Wired into the KB prompt + surfaced only at the **closing** stage.
- **Humanizer** — `lib/ai/humanizer.ts`. Pure function, **1 LLM call per reply**; splits one reply into paced bubbles (≤2 sentences / ≤140 chars each), computes per-bubble `delayMs` (500–2200ms typing sim), optional sparse leading filler. Client/gateway does the pacing → **no extra tokens**.
- **Market-Fit Analyzer** — `lib/market-fit/analyzer.ts`. Metered AI with a deterministic heuristic fallback (**never throws** → works offline / credit-out). Outputs marketType (B2B/B2C/mix), confidence, ICP, `segmentFit[]`, a per-channel **`discoveryPlaybook`** (where to find leads on LinkedIn/Google/IG/TikTok/Shopee), rationale, source.
- **Predictive readiness** — `lib/sales/predictive.ts`. **Honest: heuristic, not a trained model.** `scoreReadiness()` = stage base + signal adjustments, clamped 0–100 → band `dingin/hangat/panas`, plus a next-best-action. An **outcome-capture loop** (`detectOutcome`/`recordOutcome` in the WA inbound route) auto-logs won/lost signals; empirical closing-rate **calibration** per band annotates the readiness badge. (The calibration UI panel exists but is currently orphaned — see Reports.)
- **WA orchestrator** — `lib/wa/orchestrator.ts`. `buildWaReply()` ties it together with guardrails in order: (1) **topic guard** (politik/SARA/judi + Sales-Play `forbiddenTopics` → humanis deflect, **no AI spend**); (2) **deliberate handoff** (complaint/negotiation → holding message + `action:"handoff"`); (3) **price-gate** (techniques only at closing; when gated, injects `earlyPriceBridge`); (4) **graceful degradation** (any LLM failure / credit $0 / suspended → holding + handoff, **never "token habis"**). 1 metered call, `maxOutputTokens: 220`, then `humanize()`.
- **Rate limits** — `lib/wa/rate-limit.ts`. Serverless-safe (counts outbound rows). Two caps in bubbles: **per-lead/hour** + **per-tenant/day**. Plan defaults (starter 30/800, growth 60/4000, enterprise 120/20000); override order: per-tenant setting `wa_rl:<id>` > env > plan default. Ultimate hard cap = tenant credit ($0 → graceful holding).

**Status:** Live end-to-end (engine + WA transport). Predictive is honestly heuristic + empirical calibration, not ML.

---

## Engine: WhatsApp gateway (gateway-agnostic)

> Contract in `docs/wa-gateway-contract.md`. The **brain stays server-side**; any transport implements the same 3 endpoints. **Data: rebuild DB, DB-gated** (routes early-return `{source:"mock"}` without a DB). **Status: Live.**

- **Contract:** backend only enqueues outbound + receives inbound via webhook. Auth = shared secret `x-wa-gateway-token`. Session id = `rep:<userId>` (per-sales) or `platform:<tenantId>`. **Reply-only + allowlist** enforced server-side (`waReplyAllowed`; `modules/wa` rejects queueing to a conversation with no inbound → 409). Never cold-messages.
- **Key routes** (`app/api/wa/`): `gateway/inbound` (single brain entry — logs inbound, and with `WA_AUTO_REPLY=1` + allowlisted + rate-limit OK: loads stage/market-fit/sales-play → `buildWaReply` → saves stage + readiness → auto-captures outcome → **enqueues paced bubbles** (auto) or **saves a draft** (semi)); `gateway/outbox` (gateway polls FIFO jobs + acks); `gateway/{qr,status}` (session lifecycle); `session` (browser connect/status/disconnect — drives WAHA directly if configured, else the outbox/VPS model); `waha/inbound` (WAHA webhook normalizer → forwards to `gateway/inbound`, outbound delivered inline); `mode` (auto vs **semi** = draft needs rep approval).
- **Two transports:**
  - **WAHA** (`lib/wa/waha.ts`, `gateway/waha/`) — server-gateway, per-account QR sessions (`upsertSession` + webhook, `getQr`, `sendTextSession`, typing), plus a dependency-free `bridge.mjs` (poll outbox → typing → delay → sendText → ack) + docker-compose (NOWEB). More detectable (datacenter IP) but always-on.
  - **Chrome extension** — see below (lowest detection, not 24/7).
- **Modes:** **auto** (bubbles enqueued + sent with pacing) vs **semi-auto** (reply held as a draft; rep approves/discards in the inbox `WaDraftCard`).
- **Domain layer:** `modules/wa/service.ts` (newer rebuild `wa_session_v2` + `wa_outbox_v2`, tenant grain, reply-only, audited) sits alongside the older `lib/wa/store.ts` backing the `gateway/*` routes.

---

## Engine: Chrome extension (MV3)

> **Two artifacts exist.** The one the app SERVES + reps install is **`extension/`** — "Maira Sales — Multi-Platform Lead Collector" **v0.14.0** (downloaded as `public/maira-extension.zip` from `/settings/extension`). A separate, older **`gateway/extension/`** ("Maira WA + Discovery Bridge" v0.3.0) is the WA-Web transport bridge. Client-side DOM/RPA → posts to the DB-backed APIs; keys stay server-side.

**`extension/` (Maira Sales — the served collector) — Live:**
- **Multi-channel search** — popup with a **channel dropdown** (LinkedIn · Google · Tokopedia · Shopee · Instagram · TikTok · DuckDuckGo · AI Websearch); one "Cari" dispatches the right background job (`content.js` LinkedIn RPA, `platforms.js` for google/tokopedia/shopee/ig/tiktok, `detect.js` generic). Two-stage RPA (search → enrich) with anti-ban jitter, posture (compliant/balanced/aggressive) + consent gate, daily cap, buffer + flush.
- **Ingest** — per-rep token auto-attributes leads + tags the chosen workspace. Single → `POST /api/ingest`; bulk graph → `POST /api/discovery/ingest` (`ingestGraph`). In-extension AI (DeepSeek) classify runs **server-metered** via `/api/discovery/classify` (key never leaves the server).
- **CSV export (Live)** — besides sending to the app, auto-downloads Excel-ready CSVs on each crawl, split **B2B / B2C / perusahaan** (`chrome.downloads`, BOM UTF-8). Columns: Nama · Jabatan · Perusahaan · Lokasi · Segmen · Channel · Skor · **Email · Telepon · WhatsApp** · URL · Ringkasan · Query · Tanggal. Filename `maira-<segmen>-<query>-<date>.csv`. Manual "⬇ Unduh CSV" button + "Auto-unduh CSV" toggle.
- **Deep Enrich (Live, opt-in)** — cross-source contact hunt: for a collected lead, RPA across the sources the rep enables (**Google SERP dork · LinkedIn profil+postingan · IG/FB/TikTok · marketplace**), COLLECT raw evidence from all of them, THEN **one DeepSeek pass** picks the email/phone/WA most likely to belong to that person (confidence-scored, never fabricated) → buffer (CSV) + server (`contactPoints`). Rate-limited + anti-ban jitter; source checkboxes in the popup.
- **Heartbeat + quota sync (Live)** — `background.js` posts `/api/extension/heartbeat` on startup, every 4 min (`chrome.alarms`), and on popup open → drives "Terhubung" (`last_seen_at` < 10 min via `/api/extension/status`). The response syncs down the platform `deepseekKey`, the rep's workspaces, and the tenant's live **quota (used/limit per metric) + plan** (`tenantService.quotaSummary`) — and the popup **renders** it ("Kuota · <plan>").

**`gateway/extension/` (WA + Discovery Bridge v0.3.0) — Live (DOM path):**
- **WA Web transport** — MutationObserver → inbound; poll outbox → openChat → wait(`delayMs`) → `insertText` → synthetic Enter. Reply-only (skips groups); selectors centralized in `SEL`.
- Older discovery adapters (`EXTRACTORS` for 9 platforms) — superseded by the `extension/` collector for lead sourcing.

---

## Engine: Quota & subscription

> Canonical plan catalog lives **in code** (`lib/billing/plans.ts`); the `plan` table is a seeded mirror. Enforced in `modules/tenant/service.ts` (`evalQuota`/`enforceQuota`/`bumpUsage`/`grantQuota`) against `usage_counter` + `quota_grant`. **Status: Live.**

- **Plans (5):** `free` (Rp0), `starter` (Rp149k), `growth` (Rp499k), `enterprise` (Rp1.999k), `unlimited` (Rp0, all-`null` = unlimited). Unknown/unset plan → **fail-open (unlimited)** so existing tenants are never suddenly blocked.
- **Quota metrics:** `seats_max`, `contacts_max`, `companies_max`, `messages_max`, `ai_tokens_max`. `null` on a metric = unlimited.
- **Monthly vs lifetime:** `messages_max` + `ai_tokens_max` reset per `YYYY-MM`; the rest are lifetime accumulators.
- **Daily caps:** `messages_max` + `ai_tokens_max` carry a per-day hard cap per plan (e.g. free 20 msg / 5k tokens; starter 150 / 40k; growth 1,500 / 400k; enterprise 15,000 / 4M; unlimited none). Enforced **on top of** the monthly limit — a whole month's budget can't be burned in a day.
- **Top-up packs (all 30-day):** 7 packs in `lib/billing/quota-packs.ts` (msg +1k/+5k, AI +1M/+5M, contacts +5k, companies +2k, seats +5) → written as `quota_grant` rows summed into the effective monthly ceiling. **Packs lift the monthly limit, not the daily cap.**
- **BYOK-unmetered:** callers using their own AI key skip the `ai_tokens_max` metric (BYOK metered for analytics but not billed/capped).
- **Payment providers** (superadmin picks via `payment_provider` platform setting, `lib/billing/payments.ts`): `none` = instant demo grant (fully working); **`midtrans` fully WIRED** (Snap redirect + sha512-verified webhook `app/api/billing/webhook/midtrans`); `stripe` = **subscriptions** (checkout/portal, inert without keys); `xendit`/`tripay` = **scaffolded → 501**.
- **⚠️ Naming caveat — two "credit" concepts:** the Billing page's "Kredit AI / Top-up kredit" reads `credit_grant` (`lib/billing/credit.ts`, superadmin `grantCredit`, enforced opt-in via `CREDIT_ENFORCED`), whereas the Superadmin console's "+ Kredit" button raises `usage_counter.ai_tokens_max` (the plan quota ceiling). Different mechanisms sharing the "kredit" label.

---

## Known gaps & honest caveats (summary)

- **Rebuild data split:** Dashboard + Map read legacy `personTable`; rebuild CRM writes `modules/crm.contact` — new leads don't surface on those two screens yet.
- **WIP surfaces:** Settings hub (static), Autopilot lifecycle (records-only, not driven from UI), Discovery per-channel scrapers (IG/FB/marketplace/TikTok), Handoff "Riwayat" tab (stub), Field map (placeholder) + no per-rep visit scoping, mobile field PWA `/m` (mock).
- **Orphaned / backend-only:** cross-tenant data-trading marketplace API (no page), Reports CalibrationPanel (no import), Superadmin entitlements/deployment-mode/wa-mode UIs (components exist, not mounted) + payment-provider (set via API). (Secrets/config + docs ARE now mounted in the console.)
- **Heuristic ≠ AI where it matters:** enrichment B2C/B2B classify + predictive readiness are deterministic heuristics; only **taxonomy classify** and the conversational replies call the metered LLM.
- **Quotes:** restore-only, no hard-purge (unlike every other rebuild resource).
- **WhatsApp automation ToS/ban risk:** both WAHA and the extension are WA Web automation and violate WhatsApp ToS (the Jan 2026 update bars 3rd-party AI chatbots); a ban hits the rep's personal number. Mitigations are server-enforced (reply-only allowlist, humanized pacing, low volume, semi-auto draft→approve). For scale/safety, the official **WA Cloud API** is the clean path. LinkedIn/IG scraping likewise violates their terms (kept manual + low-volume). The extension is **not 24/7** (runs only while Chrome + the WA Web tab are open); WA Web/LinkedIn DOM selectors are fragile (centralized in `SEL`/`EXTRACTORS`).
- **"30–50% uplift" is not a guarantee** (per `progress.md`): the platform enforces a consistent methodology; the final number = PMF × lead quality × price.
