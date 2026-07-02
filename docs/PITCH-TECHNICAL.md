# Maira Sales — Technical Pitch Deck

> Slide-oriented deck. Each `## Slide N` is one slide. Presenter-ready, tight bullets.
> Grounded in the real codebase (`docs/HLA.md`, `docs/FEATURES.md`, `CLAUDE.md`, `lib/**`, `modules/**`).
> Bahasa: mix ID/EN (technical audience).

---

## Slide 1 — Maira Sales: Agentic WhatsApp Sales for Indonesia

- **One-liner:** an **agentic sales platform** that crawls leads, builds a CRM, and runs a **consultative, value-first WhatsApp conversation that enforces a real closing methodology** — Indonesia/WhatsApp-first.
- **1 workspace = 1 product.** The AI is not a generic chatbot; it drives a staged sales flow (rapport → discovery → value → objection → closing).
- **Stack:** Next.js 14 App Router · TypeScript `strict` · Drizzle + Neon Postgres (RLS) · NextAuth v5 · Vercel AI SDK · Inngest jobs · next-intl (ID default).
- **Positioning:** RPA extracts & profiles; **AI only recommends + filters product-fit + converses**. Execution & attribution per individual sales rep.
- **Honest posture:** demo-first shell on mock fixtures, with a **real multi-tenant SaaS** underneath that activates on DB + provider keys.

---

## Slide 2 — The Problem: SME Sales in Indonesia

- Sales happens in **personal WhatsApp**, manually, one rep at a time — no CRM discipline, no methodology, no memory.
- **Leads leak everywhere:** DM'd, never followed up; no pipeline, no cadence, no attribution.
- Generic AI chatbots feel like **robots** (wall-of-text, markdown, instant "ini bot" tell) → customers disengage; and they **dump the price too early**, killing the deal.
- Reps have **no consistent closing method** — outcomes swing on individual skill, not a repeatable process.
- Data is scattered across LinkedIn, Maps, IG, marketplaces — **no single Company→People graph**, no fit scoring.
- Compliance (UU PDP No. 27/2022) is an afterthought; consent/provenance untracked.

**Thesis:** enforce a *methodology* (staged, value-first, price-gated, human-paced) on top of a real multi-tenant CRM — and make the AI feel human, not robotic.

---

## Slide 3 — High-Level Architecture

- **Modular monolith, Next.js 14 process.** Every domain is a vertical slice `modules/<domain>/{schema,repo,service}.ts`; routes stay THIN (`app/api/**/route.ts` → service → repo). **23 domains** (crm, wa, inbox, enrichment, sales, outreach, tenant, taxonomy…).
- **Two data layers by design:**
  - **Mock layer** (`lib/api-mock/`, faker fixtures via TanStack Query) — the default no-DB demo.
  - **Real SaaS layer** (`modules/**` + `app/api/**` + Neon Postgres) — **DB-gated**: `if (!hasDb()) return ok([])`. A feature can be live code yet inert in the demo.
- **Multi-tenant Postgres + RLS** (`~108 tables`): grain = **tenant/account**. Every query runs in `withTenant(ctx, fn)` → `set_config(app.tenant_id/user_id/role)`; RLS policies filter by `app.tenant_id`. **Belt-and-suspenders**: repos also `eq(tenantId)`.
- **Auth/RBAC:** NextAuth v5 (Credentials, scrypt), edge middleware gate + per-route `requirePermission()` with **live role re-resolution** + tenant-status gate.
- **Background jobs:** Inngest (`/api/inngest`) — cadence dispatch, cron follow-up.
- **WA transport is gateway-agnostic:** the brain is server-side; transports just poll an outbox + push inbound.

```
Browser → edge middleware (auth) → route (THIN, requirePermission, hasDb)
        → modules/<domain>/service (logic, quota, audit, soft-delete)
        → repo (queries, always withTenant) → Neon Postgres (RLS: app_user NOBYPASSRLS)
```

---

## Slide 4 — The Crawl → CRM → Closing Flow

- **1. Discover (RPA, channel-agnostic).** `discovery_job` (query + channel + posture) → `discovery_result` (raw lead). Sources: LinkedIn / Google Maps / SERP (live), IG/FB/marketplace/TikTok (WIP). High-volume SERP server-side; behind-login enrich via the Chrome extension.
- **2. Enrich + classify.** `enrichment_record`: fields + source + **B2C/B2B classification** + **fit_score (0..1)**. Extension in-browser AI classify runs **server-metered** (key never client-side).
- **3. CRM graph.** Company→People graph in `company_v2` / `contact`, tagged with **taxonomy** (industri + pekerjaan master data, AI-classified, `unique(tenant,slug)` + upsert + dedup/merge).
- **4. Workspace (1 = 1 product).** Product → **Market-Fit Analyzer** (B2B/B2C/mix + ICP + segment scores + per-channel discovery playbook) → **Sales Play** (channel/tone/techniques/adab).
- **5. Engage.** Inbox (WA + email), Pipeline/Deals, Cadence (cross-channel sequences), Autopilot, Penawaran (quote-to-cash w/ public tracking link).
- **6. Close.** Stage machine + 17 closing techniques + humanizer drive the WA conversation to a deal; escalate to human on complaint/negotiation.
- **7. Retain.** Retention/win-back flows, e-commerce cart recovery, one-click WA nudge.

---

## Slide 5 — Feature Catalog (grouped by sidebar IA)

- **Utama:** Dashboard (KPIs/funnel/quota card) · **Workspace** (7-tab closing-flow cockpit: Produk/Market-Fit/Funnel/Kontak/Sales Play/Teknik).
- **Leads:** Kontak & Lead CRM (CRUD one-page + right-drawer + soft-delete) · Discovery (channel-agnostic graph) · Contact Profiles (Perusahaan/Orang) · Contacts Map (Leaflet) · Enrichment queue · Master Data (taxonomy).
- **Eksekusi:** Inbox (omni-channel, reply-mode toggle, readiness badge) · Pipeline/Deals (kanban + hot-lead) · Penawaran/Quote (AI compose, `/q/<token>` public tracking) · Cadence (WA/Email/Call sequences) · Autopilot (AI orchestration ledger) · Eskalasi/Handoff (human-takeover queue + SLA).
- **Lainnya:** Konten (templates + calendar) · Retensi & Win-back · E-Commerce (orders + cart recovery) · Marketplace (store integrations) · Sales Lapangan (geo check-in) · Laporan & Analitik (8 live roll-ups).
- **Pengaturan:** Branding (per-user white-label) · AI & Model/BYOK · Team & Access (RBAC) · Billing/Quota/Packs · Extension · Knowledge Base · Compliance/UU PDP · Mailboxes · Diagnostics.
- **Superadmin:** cross-tenant console — provision/activate/suspend/top-up/trash + **AES-256-GCM encrypted secrets** console.
- **Engines (cross-cutting):** Closing-Flow AI · WhatsApp gateway · Chrome extension · Quota & subscription.

> Every rebuild resource follows **soft-delete → Sampah → restore → hard-purge**. Honest WIP flags kept per feature.

---

## Slide 6 — AI Tokenization & Metering

- **Every live AI call flows through the meter** (`lib/ai/meter.ts`: `meteredGenerateText` / `meteredStreamText`). Nothing escapes it.
- **Call flow:** ① kill-switch (`isTenantActive` — suspended/pending/expired → throw) → ② `assertCredit` (if `CREDIT_ENFORCED` & balance ≤ 0 → throw) → ③ `resolveActiveModel` → ④ quota gate (platform key only) → ⑤ **floor `maxOutputTokens ≥ 1200` for reasoning models** → ⑥ generate/stream → ⑦ log to `ai_usage` + bump quota.
- **Reasoning-model floor:** regex `v4-flash|v4-pro|reasoner|reasoning|[-_]r1\b|think` — these burn output tokens on *hidden reasoning* before emitting text, so a tight cap returns **empty**. Non-reasoning models keep the caller's exact budget.
- **One active model per tenant:** `tenant_active_model → ai_model → ai_provider → ai_credential`. All workspaces share it.
- **BYOK vs platform key:** tenant BYOK (`ai_credential.apiKeyEnc`, AES-256-GCM) → `keySource="tenant"`, **uncounted** (tenant pays its own provider). No BYOK → `platformKey(env)`, `keySource="platform"`, **metered + quota-gated**.
- **`ai_usage` logging:** `tokensIn/tokensOut`, USD **cost** from the model's snapshotted per-1M pricing, latency, feature — per call, `withTenant`.
- **Credit / kill-switch:** `$0` throws → callers **degrade gracefully** (holding + handoff). Users **never** see "token habis".
- **Quota:** plans (`free/starter/growth/enterprise/unlimited`) + top-up **grants** (30-day) + **daily caps** (a month's budget can't burn in a day). Metrics: `seats/contacts/companies/messages/ai_tokens_max`.

---

## Slide 7 — Guardrails

- **priceGate** (`stage-machine.ts`): no price until **need + value** land. Asked early → **bridge to needs**, never refuse, never quote (`earlyPriceBridge` injected into the prompt).
- **Handoff-to-human** on complaint / negotiation / credit-$0: deliberate handoff regex (komplain/refund/tipu/"bicara manusia"/lawyer) → **holding message + `action:"handoff"`**, never an error.
- **Multi-tenant isolation:** `withTenant` sets `app.tenant_id`; **RLS `FORCE ROW LEVEL SECURITY`** filters every row (fail-closed: unset tenant → 0 rows). Repos *also* filter `eq(tenantId)` → belt-and-suspenders. App runs as `app_user` (**NOBYPASSRLS**); migrations as owner (BYPASSRLS).
- **Reply-only WA against a backend allowlist:** transports never cold-message; `waReplyAllowed` decides which numbers the AI answers; queueing to a conversation with no inbound → **409**. Gateway auth = shared `WA_GATEWAY_TOKEN`.
- **Honest WA-ToS caveat:** WAHA + extension are WA Web automation and **violate WhatsApp ToS** (Jan 2026 bars 3rd-party AI chatbots). Mitigations: reply-only + human pacing + low volume + semi-auto (draft→approve). Clean path at scale = **WA Cloud API**.
- **RBAC role guards** (`lib/rbac/`): `superadmin | tenant_owner | tenant_admin | member`; layered **DB (RLS) → API (guards) → UI (hide actions)**; superadmin routes assert `isSuperadmin===true`, not just role string; role re-resolved live per request (only downgrades).
- **Topic guard** (politik/SARA/judi) → humanis deflect, **no AI spend**.

---

## Slide 8 — AI Rules / Conversation Engine

- **Stage machine** (`lib/sales/stage-machine.ts`): deterministic/regex, **no AI cost**. `rapport → discovery → value → objection → closing`. Detects 5 ID signals (need/value/price-asked/objection/closing-intent). Objection outranks closing; closing is **sticky**. `decide()` → `{ stage, priceGateOpen, nextAction, guidance }`.
- **Per-workspace SalesPlay** (`lib/types/sales-play.ts`): `marketType`, `stages`, **adab** (max sentences/bubble, filler, close-questions, no-markdown, emoji register, forbiddenTopics), `priceGate` (requireNeed/requireValue/earlyPriceBridge), `worthOfCost` anchors, `valueLadder` (ordered value points before price), `handoff` rules, allowed technique ids, stage-linked materials.
- **17 closing techniques** (`lib/kb/closing-techniques.ts`, Dewa Eka Prayoga): each `{ nama, inti, contohSkrip?, cocokUntuk:(B2B|B2C)[], sinyalPemicu[] }`. Aggressive ones (Kelangkaan, Now-or-Never, Harga Coret, Machine Gun, Cek Stok…) tagged **B2C-only**; `formatClosingTechniques({market})` filters so **B2B never gets them**. Surfaced **only at the closing stage**.
- **Humanizer** (`lib/ai/humanizer.ts`): **1 LLM call per reply** → paced bubbles. Strips markdown (people don't type `**bold**`), splits into ≤2 sentences / ≤140 chars each, per-bubble `delayMs` (28ms/char, clamped **500–2200ms** typing sim), optional sparse filler ("hmm...", "bentar ya 🙏"). Client/gateway paces → **no extra tokens**.
- **Orchestrator** (`lib/wa/orchestrator.ts`): guardrails in order → topic guard → deliberate handoff → priceGate/technique injection → 1 metered call (`maxOutputTokens: 220`) → humanize → graceful degradation on any failure. Plus **predictive readiness** (0–100 band + next-best-action, honest heuristic).

---

## Slide 9 — Multi-Provider AI (BYOK-ready)

- **Provider-agnostic registry** (`lib/ai/registry.ts` + `adapters.ts`): `makeModel(providerKey, modelId, apiKey, baseUrl)` returns a Vercel AI SDK `LanguageModel`.
- **Wired today:** `deepseek` (`@ai-sdk/deepseek`), `anthropic` (`@ai-sdk/anthropic`).
- **Platform-key stubs ready:** `openai`, `google` — `platformKey()` reads `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`; add a provider = `npm i @ai-sdk/<x>` + one `case` in `makeModel`.
- **Per-tenant choice:** each tenant picks **one active model** (Settings → AI); BYOK key overrides the platform env-key per provider.
- **Model classes (DeepSeek):** `deepseek-v4-pro` (chat), `deepseek-v4-flash` (fast drafts), `deepseek-reasoner` (analysis).
- **Design constraints:** sampling params (temperature) **intentionally omitted** — they 400 on Anthropic Opus and the registry is provider-agnostic. Keys are **server-side only**; `NEXT_PUBLIC_AI_PROVIDER` is the one client-safe flag.
- **Cost accuracy:** per-model per-1M pricing is snapshotted on `ai_model`, used to compute USD cost at log time.

---

## Slide 10 — Data Model Highlights

- **`_v2` rebuild tables** coexist with legacy in one Drizzle client. Colliding names get a `_v2` suffix: `company_v2`, `workspace_v2`, `conversation_v2`, `wa_session_v2`, `wa_outbox_v2`, `audit_log_v2`. Clean singular names where no legacy twin (`contact`, `deal`, `pipeline`, `activity`).
- **No foreign keys.** Every `*_id` is a plain text **soft ref**; referential integrity + cascade live in the **service layer**, never the DB (portable, tenant-safe).
- **Soft-delete-first.** Every table: `id, tenant_id, created_at, updated_at, deleted_at`. Repos filter `deleted_at IS NULL`. UI exposes **soft-delete → Sampah → restore → hard-purge** on *every* resource (incl. crawl/enrichment).
- **Dedup built in:** company by normalized `domain`; taxonomy by `unique(tenant, slug)` + upsert + merge; e-commerce ingest idempotent on `(channel, external_id)`.
- **Tenant grain everywhere** + per-table `*_tenant_idx`; contacts additionally scoped by `workspace_id` in-app.
- **Keyset (cursor) pagination** helpers in `modules/_shared/api.ts` (`Page<T>`, `encode/decodeCursor`, `MAX_PAGE_LIMIT=200`).
- **Envelope:** `{ ok, data }` / `fail(msg, status, code)`; `ServiceError` → typed `fail()`.

---

## Slide 11 — Extension / RPA (per-rep, channel adapters)

- **Served collector** (`extension/`, "Maira Sales — Multi-Platform Lead Collector" v0.14.0), installed per rep from `/settings/extension`. RPA runs in the rep's real browser + rep IP → **most human fingerprint**.
- **Multi-channel search:** channel dropdown (LinkedIn · Google · **Google Maps** · Tokopedia · Shopee · Instagram · TikTok · DuckDuckGo · AI Websearch). Two-stage RPA (search → enrich) with anti-ban jitter + posture (compliant/balanced/aggressive) + consent gate + daily cap.
- **Per-rep ingest token** auto-attributes crawled leads to that rep + tags the chosen workspace. Single → `POST /api/ingest`; bulk graph → `POST /api/discovery/ingest` (`ingestGraph`).
- **In-browser AI classify** (`/api/discovery/classify`) runs **server-metered** — the DeepSeek key never leaves the server, so it can't bypass quota/kill-switch.
- **Deep Enrich (opt-in):** cross-source contact hunt (Google SERP dork + LinkedIn + IG/FB/TikTok + marketplace) → collect raw evidence → **one DeepSeek pass** picks the most-likely email/phone/WA (confidence-scored, never fabricated).
- **CSV export:** auto-downloads B2B / B2C / perusahaan splits (BOM UTF-8, Excel-ready).
- **Heartbeat + quota sync:** posts `/api/extension/heartbeat` on startup + every 4 min → drives "Terhubung", syncs down platform key, workspaces, and **live quota (used/limit + plan)** — the same numbers the platform enforces.
- **Separate WA bridge** (`gateway/extension/`, v0.3.0): WA Web transport — MutationObserver inbound + poll-outbox outbound, reply-only.

---

## Slide 12 — Notifications + Observability

- **In-app notification feed** (`modules/notification`): behind the topbar bell. Rows for new-lead / won-deal / escalation / low-quota / marketplace-sale / member / tenant events. Written **best-effort at the triggering event** (`emit`) so a notification failure never breaks the action.
  - Grain = tenant, optional user narrowing (`user_id NULL` = tenant-wide; else private). Soft-deletable, immutable except `read`/`deleted_at`.
- **Audit log** (`audit_log_v2`): **every write** stamps an audit row (`platformRepo.insertAudit`) — actor, action, target, tenant. Nullable-tenant platform rows visible only to superadmin (RLS).
- **`ai_usage`** doubles as AI observability: tokens in/out, cost, latency, feature, model — per tenant/user/call.
- **Superadmin console** (`/admin`, brand-neutral shell): cross-tenant KPI strip (tenants/pending/users/audit), provision, activate (duration + AI-token quota), suspend kill-switch, top-up, soft-delete/restore/purge; **Secrets & Config** tab (masked previews, DB/env source badge) + **Dokumentasi** tab.
- **Diagnostics** (`/settings/diagnostics`, superadmin): live env/DB introspection, AI ping, per-route `real/mock/error` source discriminator (incl. `x-ai-source` header) to pinpoint mock surfaces.

---

## Slide 13 — Roadmap (forward-looking)

> _Marked as roadmap — not yet built. Current state is honestly flagged WIP where partial._

- **BYOA — per-account (per-rep) API keys:** today BYOK is **per-tenant**; roadmap is **per-rep** provider keys so each sales rep's usage is isolated + attributed to their own account/billing.
- **Agent task-queue:** promote Autopilot from a **records-only ledger** to a real orchestrator — durable queue of agent tasks with status transitions + step execution driven from the surface (today it only records a `queued` run).
- **Agent-driven extension:** the server-side brain dispatches crawl/enrich/reply **tasks to the extension** (vs. the rep manually clicking "Cari") — closing the loop into a fully agentic per-rep worker.
- **Discovery scrapers:** finish per-channel browser scrapers (IG/FB/marketplace/TikTok — currently WIP; LinkedIn/Maps/SERP live).
- **Predictive → ML:** current closing-readiness is a **calibrated heuristic**; roadmap swaps in a trained model off the outcome-capture loop.
- **WA Cloud API transport:** add the official, ToS-clean transport for scale (alongside WAHA + extension).
- **Payment gateways:** `stripe / xendit / tripay` currently scaffolded (501); `midtrans` + `none` are wired.

---

## Slide 14 — Security & Compliance

- **UU PDP No. 27/2022 controls** (`/settings/compliance`): control toggles + deterministic compliance score (derived, never stored). Page-gated to DPO roles; writes gated to `tenant.settings.manage`.
- **DSAR:** export → JSON; cross-table **erase** (opt-out list retained); retention purge of `ai_usage` / `send_job` / `crawl_job`.
- **Encrypted secrets — AES-256-GCM:** blob `v1.<iv>.<authTag>.<ciphertext>`. Two vaults: platform secrets (`platform_setting_v2 "sec.<KEY>"`, superadmin-managed, **DB-first → env fallback**, 60s cache) and **per-tenant BYOK** (`ai_credential.apiKeyEnc`). Only `SECRETS_KEY`, DB URL, `AUTH_SECRET` must live in env (chicken-and-egg). `listSecretStatus()` returns **masked previews only**.
- **Row-Level Security:** `FORCE ROW LEVEL SECURITY` on every tenant table; app runs as **`app_user` (NOBYPASSRLS)**; superadmin escape is in the **policy predicate** (auditable), not a DB superuser. Fail-closed on unset tenant.
- **Passwords:** Node **scrypt** (`scrypt$N$salt$hash`, constant-time compare) — no bcrypt/argon2 dep. Login rate-limited (per-IP 30/15min + per-email 10/15min); generic errors (no user-enumeration oracle).
- **Provenance + consent** captured on enrichment; RPA is posture/consent-gated + rate-limited (own accounts, low volume) — honest LinkedIn/IG/WA ToS caveats documented.
- **Full audit trail** on every write (`audit_log_v2`); metered AI logged to `ai_usage`.

---

*Deck end. See `docs/HLA.md` for the full architecture and `docs/FEATURES.md` for the honest feature inventory (incl. WIP/orphaned caveats).*
