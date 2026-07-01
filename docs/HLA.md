# High-Level Architecture (HLA)

**Maira Sales** — a demo-first, Indonesia/WhatsApp-focused **agentic sales platform**.
Next.js 14 (App Router) + TypeScript, deployed on Vercel with a Neon (serverless
Postgres) backend.

> **Status (2026-07):** the project is mid-rebuild under the **Sainskerta Loop**
> workflow (`loop-workflow/`, tracked in `loop-progress.md`). The greenfield
> rebuild (`modules/**` + `app/api/**`, real DB) is code-complete for M1–M9 and
> passed an internal audit; the legacy **mock-first demo** (`lib/api-mock/`) still
> ships as the default no-DB experience. Read this doc as the *target* architecture,
> with the legacy layer noted where it still fronts screens.
>
> Two living trackers, do not conflate them:
> - `progress.md` — Closing-Flow AI initiative (the sales brain: `lib/sales/`, `lib/market-fit/`, `lib/kb/`, `lib/wa/`).
> - `loop-progress.md` — the Sainskerta Loop rebuild (module-by-module vertical slices).

---

## 1. Overview — the "demo-first, DB-gated real SaaS" duality

The app is deliberately **two applications sharing one Next.js process**:

```
                         ┌──────────────────────────────────────────────┐
                         │              Next.js 14 (App Router)          │
                         │                                               │
   Browser ── page ─────▶│  React Server/Client components + hooks       │
                         │        │                        │             │
                         │        │ (default)              │ (DB-gated)  │
                         │        ▼                        ▼             │
                         │  lib/api-mock/*         app/api/**/route.ts   │
                         │  (TanStack Query,       (thin) → modules/*    │
                         │   faker fixtures,        service → repo       │
                         │   lib/mock-data/)               │             │
                         │        │                        ▼             │
                         │        │                 withTenant(ctx)      │
                         └────────┼────────────────────────┼─────────────┘
                                  │                         │
                          (no network / in-proc)     Neon Postgres (RLS)
```

- **Mock layer** (`lib/api-mock/`, `lib/mock-data/`, `lib/stores/`): fully
  navigable demo on faker-seeded fixtures via **TanStack Query** hooks (not MSW).
  Requires no DB, no keys. This is what most screens still read.
- **Real SaaS layer** (`modules/**`, `app/api/**`, `lib/db/`): multi-tenant
  Postgres + RBAC + RLS, NextAuth, metered AI, quota/billing, WhatsApp transport,
  Inngest jobs, SMTP/OAuth/ESP email. **Gated on runtime signals**: `hasDb()`
  (a Postgres URL is present) and provider keys/secrets. When absent these paths
  **no-op or fall back** to mock (e.g. a route returns `ok([])` or `503`, the AI
  meter degrades to a holding message).

**Gating in practice** (`app/api/companies/route.ts` is the canonical shape):

```ts
const g = await requirePermission("data.read");     // auth + RBAC + tenant-status
if ("error" in g) return g.error;                    // 401 / 403 envelope
if (!hasDb()) return ok([]);                          // no DB → graceful empty/fallback
return handle(() => ok(await crmService.listCompanies(g.ctx)));
```

So: **a feature can be "live code" and still inert in the running demo** because no
DB/keys are wired. Always check `hasDb()` / secret presence before reasoning about
whether a path executes.

---

## 2. Tech stack + modular-monolith structure

**Stack:** Next.js 14 App Router · TypeScript (`strict`) · Drizzle ORM + Neon/`@vercel/postgres` ·
NextAuth v5 (Credentials) · Vercel AI SDK (`ai` + `@ai-sdk/*`) · Zustand (client state) ·
TanStack Query (mock server-state) · Tailwind + shadcn/ui · next-intl (id default, en toggle) ·
Inngest (jobs) · Recharts. Path alias `@/*` → repo root.

**Rebuild = modular monolith.** Every domain is a vertical slice under
`modules/<domain>/`:

```
modules/<domain>/
  schema.ts   → Drizzle tables (snake_case SQL, camelCase props, NO foreign keys,
                every table: id, tenant_id, created_at, updated_at, deleted_at)
  repo.ts     → data access ONLY (queries, always wrapped in withTenant, filters
                deleted_at IS NULL)
  service.ts  → ALL business logic + cross-module side-effects (audit, cascade,
                quota, soft/restore/hard-delete). Throws ServiceError.

app/api/<route>/route.ts  → THIN: parse input → call service → wrap in {ok,data}
```

Domains present: `tenant · auth · onboarding · branding · superadmin` (M1) ·
`workspace · product` (M2) · `crm` (M3) · `inbox · wa` (M4) · `enrichment` (M5) ·
`sales` (M6) · `outreach` (M7) · `settings` (M8) · `content · retention · ecommerce ·
marketplace · field · reports` (M9) · plus `taxonomy` (industry/occupation master data).

**Schema barrel** (`modules/index.ts`) re-exports every `schema.ts` so the single
Drizzle client (`lib/db/client.ts`) and drizzle-kit see all rebuild tables (~108
tables live on Neon). Legacy `lib/db/schema.ts` tables are merged into the *same*
client — rebuild tables that collide with a legacy name take a `_v2` suffix
(`company_v2`, `workspace_v2`, `conversation_v2`, `wa_session_v2`, `audit_log_v2`, …).

**Conventions that are load-bearing:**
- **No FKs.** Every `*_id` is a plain text soft-ref; referential integrity + cascade
  live in the **service layer**, never the DB.
- **Soft-delete everywhere** (`deleted_at`) with restore + hard-delete (purge)
  exposed in the UI, for *every* resource including crawl/enrichment.
- **`{ ok, data }` envelope** for all rebuild routes (`modules/_shared/api.ts`):
  `ok(data)` / `fail(msg, status, code)`; `ServiceError` thrown by services is
  turned into a typed `fail()` by `handle()`. Keyset (cursor) pagination helpers
  live here too (`Page<T>`, `encodeCursor`/`decodeCursor`, `MAX_PAGE_LIMIT=200`).

---

## 3. Multi-tenancy + Row-Level Security

**Grain = TENANT (account), not per-user.** Activation, duration, quota, and credit
are all tenant-scoped.

Every tenant-scoped query runs inside **`withTenant(ctx, fn)`**
(`lib/db/tenant-context.ts`), which opens a transaction and sets three
transaction-local Postgres settings (parameterized `set_config(..., true)` →
injection-safe):

```
withTenant({ tenantId, userId, role }) ─▶ BEGIN
   set_config('app.tenant_id', <tenant>, true)
   set_config('app.user_id',   <user>,   true)
   set_config('app.role',      <role>,   true)
   fn(tx)  ─▶ RLS policies filter by app.tenant_id
```

`withUserContext(userId, fn)` sets **only** `app.user_id` for the **pre-tenant**
login path (resolving "which tenants is this user in?" before a tenant is chosen).

**Two-role RLS model** (`drizzle/rls/enable-rls.sql`, `lib/db/client.ts`):

| Connection | Env var | RLS |
|---|---|---|
| Migrations / drizzle-kit / studio | owner (`neondb_owner`) | **BYPASSRLS** — policies don't apply (intentional) |
| App runtime | `app_user` (**NOBYPASSRLS**) via `APP_POSTGRES_URL` | policies **apply** — `set_config` calls are load-bearing |

- Every rebuild table with a `tenant_id` gets `ENABLE` + `FORCE ROW LEVEL SECURITY`
  and a `tenant_isolation` policy: `USING`/`WITH CHECK` pin `tenant_id =
  current_setting('app.tenant_id')`, with a `app.role = 'superadmin'` escape in the
  **policy predicate** (auditable, not a DB superuser).
- **Fail-closed:** an unset `app.tenant_id` matches no row → a query that forgets
  `withTenant` leaks nothing.
- **Special policies:** `membership` also allows `user_id = app.user_id` (pre-tenant
  login read); `audit_log_v2` allows nullable-tenant platform rows only for
  superadmin. Global catalogs (`app_user`, `tenant`, `ai_provider`, `ai_model`,
  `platform_setting_v2`, …) carry no `tenant_id` and are app-gated instead.
- **Fallback posture:** if `APP_POSTGRES_URL` is unset, the app connects as owner
  (BYPASSRLS) and app-level `eq(tenantId)` repo filters are the *sole* control.
  `usingRlsRole()` reports which path is live; a real deploy MUST set the app role.
  This is **belt-and-suspenders**: repos filter by tenant AND RLS enforces it.

---

## 4. Authentication + gating

**NextAuth v5, Credentials provider, JWT strategy.** Split across the edge/node
boundary:

- `lib/auth/auth.config.ts` — **edge-safe** base config (no Node/Postgres imports),
  used by the edge `middleware.ts`. Holds `jwt`/`session` callbacks that copy
  `role`, `tenantId`, `isSuperadmin`, `tenantStatus`, `avatarColor` onto the token/
  session. `trustHost` is conditional (pinned URL / Vercel / non-prod only).
- `lib/auth/auth.ts` — **Node runtime** full config; injects the Credentials
  provider whose `authorize()` does the heavy work.

**Login flow:**

```
credentials ─▶ rate-limit (per-IP 30/15min + per-email 10/15min)
            ─▶ [hasDb] authService.verifyCredentials(email, pw)
                   getUserByEmail → verifyPassword (scrypt) → firstMembership
                   → { user, membership } (+ live tenant status) → mark last_login
            ─▶ [isDemoMode only, non-prod] offline demo accounts on t_default
            ─▶ null → generic "wrong credentials" (no user-enumeration oracle)
```

- **Passwords:** Node built-in **scrypt** (`modules/auth/password.ts`), stored as
  `scrypt$<N>$<saltHex>$<hashHex>`, constant-time compare. No bcrypt/argon2 dep.
- **Membership resolution:** `membershipRole(membership.role, isSuperadmin)`
  (`lib/rbac/permissions.ts`) maps DB roles → canonical
  `superadmin | tenant_owner | tenant_admin | member`. `is_superadmin` overrides all.
- **Demo accounts** are gated behind `isDemoMode()` (mock provider AND
  `NODE_ENV !== "production"`) → guaranteed dead in a real deploy, and can never
  mint superadmin.

**Two gating layers:**

1. **Edge middleware** (`middleware.ts`): redirects unauthenticated page requests to
   `/login?next=…`. Public: `/`, `/login`, `/register`, `/unsubscribe`, `/api/*`
   (APIs self-guard).
2. **Per-route guard** (`lib/rbac/guard.ts` → `requirePermission(permission, opts)`),
   which resolves context via `getTenantContext()` and enforces:
   - 401 no session · 403 lacks permission
   - **Per-request re-resolution (audit #7):** `getTenantContext()`
     (`lib/auth/session-context.ts`) re-reads live `role`/`is_superadmin` from the DB
     each request (only ever *downgrades*; fails open on DB error), so a demotion or
     "log out everywhere" takes effect immediately rather than at JWT expiry.
   - **Superadmin routes** additionally require a direct `isSuperadmin === true`
     assertion (not just the role string).
   - **Workspace / tenant-status gate (audit #6):** a `pending | suspended | expired`
     tenant is 403'd server-side (status read live from `tenant`, not the stale JWT).
     Superadmin + explicit `allowInactiveTenant` recovery endpoints are exempt;
     skipped without a DB.

**RBAC matrix** (`lib/rbac/permissions.ts`): permissions like `platform.manage`,
`tenant.billing`, `tenant.members.manage`, `tenant.settings.manage`, `data.read/write/
export`, `campaign.manage`, `mailbox.connect`, `ai.use`, gated via `can(role, perm)`.
Enforcement is layered: **DB (RLS) → API (guards) → UI (hide actions)**.

---

## 5. AI: metered path + BYOK

There are **two AI paths** — know which one a route uses:

- **Static demo path** (`lib/ai/provider.ts`): DeepSeek called directly, switched by
  `NEXT_PUBLIC_AI_PROVIDER` (`mock` heuristics vs `deepseek`); offline fallback in
  `lib/api-mock/kb.ts` (`composeKbReply`). No metering, no tenant resolution.
- **Live metered path** (`lib/ai/meter.ts` + `registry.ts` + `adapters.ts`): the real
  SaaS path — **every live call goes through the meter**.

**Metered call flow** (`meteredGenerateText` / `meteredStreamText`):

```
meteredGenerateText(ctx, opts)
  1. isTenantActive(ctx)          — kill-switch (suspended/pending/expired → throw)
  2. assertCredit(ctx)            — if CREDIT_ENFORCED and balance ≤ 0 → throw
  3. resolveActiveModel(ctx)      — tenant's ONE active model (see below)
  4. quota gate (platform key only): enforceQuota(ai_tokens_max)
  5. floor maxOutputTokens ≥ 1200 for reasoning models (else empty replies)
  6. generateText / streamText
  7. log tokens + cost → ai_usage (withTenant); bump ai_tokens_max usage
```

**Active-model + BYOK resolution** (`lib/ai/registry.ts`, `adapters.ts`):

```
tenant_active_model ─▶ ai_model ─▶ ai_provider ─▶ ai_credential (this tenant?)
                                                        │
                        ┌───────────────────────────────┴───────────────┐
                     BYOK present                                 no BYOK
                 decryptSecret(apiKeyEnc)                    platformKey(providerKey)
                 keySource = "tenant"                        from process.env
                 (uncounted, tenant pays)                    keySource = "platform"
                                                             (metered + quota-gated)
   makeModel(providerKey, modelId, apiKey, baseUrl) → Vercel AI SDK LanguageModel
```

- **Multi-provider:** `deepseek`, `anthropic` (wired in `adapters.ts`); `openai`,
  `google` have platform-key stubs. Add one by `npm i @ai-sdk/<x>` + a `case`.
- **BYOK rule:** only the **platform key** is metered against the AI-token quota;
  when the tenant brings its own key it pays its own provider → no platform cap.
- **Kill-switch** (`lib/admin/kill-switch.ts`): a non-active tenant can't run AI or
  send email — checked at the top of the meter.
- **Credit** (`lib/billing/credit.ts`): balance = plan allowance + Σ grants − consumed
  (`ai_usage`). Enforcement is opt-in (`CREDIT_ENFORCED=1`); off by default so the
  demo never blocks. `$0` throws → callers **degrade gracefully** (holding + handoff),
  never a "token habis" error.
- Sampling params (temperature) are intentionally omitted (400 on Anthropic Opus);
  keys are server-side only, `NEXT_PUBLIC_*` is the one client-safe flag.

---

## 6. Quota / subscription system

Canonical plan catalog in **code** (`lib/billing/plans.ts`); the legacy `plan` table
is a DB mirror seeded from it. Enforcement resolves ceilings from the plan via the
tenant's `plan_key`, using `usage_counter` only for the per-period `used` value.

**Metrics** (`QuotaMetric`): `seats_max`, `contacts_max`, `companies_max`,
`messages_max`, `ai_tokens_max`. `null` on a metric = unlimited.

- **Monthly metrics** (`messages_max`, `ai_tokens_max`): period `YYYY-MM`, reset when
  the key rolls over. Others are lifetime accumulators.
- **Daily caps** (`PLAN_DAILY_CAPS`): the monthly metrics ALSO carry a per-day hard
  cap (period `YYYY-MM-DD`) so a month's budget can't burn in a day. Both the
  monthly and daily checks must pass.
- **Top-up packs** (`quota_grant`, `lib/billing/quota-packs.ts`): lift the
  monthly/lifetime ceiling (`planLimit + Σ active grants`) but **not** the daily cap.

Plans: `free` · `starter (149k)` · `growth (499k)` · `enterprise (1.999m)` ·
`unlimited`. An unknown/unset plan → **unlimited (fail-open)** so unplanned tenants
never block.

**Enforcement points** (`modules/tenant/service.ts`):

```
evalQuota(ctx, metric, delta) → checks (month/lifetime ceiling+packs) AND (daily cap)
  ├─ enforceQuota()  → throws ServiceError(402, "quota_exceeded")   [hard paths]
  └─ canConsume()    → boolean, non-throwing                        [graceful paths]
bumpUsage(ctx, metric, delta) → increments the period counter (+ daily counter)  [after success]
```

Callers: AI meter (`ai_tokens_max`), WA outbox `enqueue` (`messages_max`, non-throwing
→ auto-reply stops mid-reply rather than erroring), `addMembership` (`seats_max`).
`quotaSummary()` drives the quota UI + the extension heartbeat (same numbers the
platform enforces).

**Payments** (`lib/billing/payments.ts`): the active gateway is a superadmin platform
setting (`payment_provider`):
- `none` → **instant** self-serve grant (demo, fully working).
- `midtrans` → **wired**: Snap `redirect_url` checkout + webhook. Signature =
  `sha512(order_id + status_code + gross_amount + serverKey)`; paid = settlement /
  non-fraud capture. Webhook activates the pending `quota_grant`
  (`tenantService.activatePurchase`, idempotent, validity starts at payment).
- `stripe | xendit | tripay` → scaffolded (501 until wired). Stripe billing code
  also exists under `lib/billing/` for the subscription tier.

---

## 7. WhatsApp transport (gateway-agnostic)

The **brain stays server-side**; transports are dumb: they **poll an outbox** and
**push inbound**. Contract in `docs/wa-gateway-contract.md` / `docs/42-*.md`.

```
 Inbound WA msg ─▶ transport ─▶ POST /api/wa/gateway/inbound (or /api/wa/waha/inbound)
                                        │
                                        ▼
                        lib/wa/orchestrator.ts  buildWaReply(ctx, input)
                          decide(stage) (stage-machine) · topic-guard · priceGate
                          · handoff signals · closing techniques (closing stage only)
                          · meteredGenerateText → humanize() → Bubble[]
                                        │
                          enqueue 1 job per bubble (delayMs + typing) → wa_outbox_v2
                                        │
 outbound ◀─ transport polls pollOutbox(?sessionId=) ─ honors pacing ─ ackOutbox()
```

**Store** (`lib/wa/store.ts`): `wa_session_v2` (per-rep `rep:<userId>` or per-platform
`platform:<tenantId>`) + `wa_outbox_v2` (FIFO by `createdAt` so paced bubbles arrive
in order). `enqueue("send")` consumes `messages_max` non-throwingly. **Reply-only
allowlist** (`waReplyAllowed`) — the backend decides which numbers the AI may answer;
empty = allow all. Gateway auth = shared `WA_GATEWAY_TOKEN`.

**Orchestrator guardrails** (`lib/wa/orchestrator.ts`):
- **Stage machine** (`lib/sales/stage-machine.ts`): rapport → discovery → value →
  objection → closing; detects need/value/price/objection signals.
- **priceGate** — no price until need + value land; asked early → bridge to needs.
- **Humanizer** (`lib/ai/humanizer.ts`) — splits ONE LLM reply into short paced
  bubbles (`[{ kind, text, delayMs }]`); client/gateway does the pacing → still 1 LLM
  call, no extra AI cost.
- **Topic guard** (politik/SARA/judi) → humanis deflect, **no AI spend**.
- **Graceful degradation** — no model / credit $0 / suspended → holding + **handoff**,
  never an error. Complaint/negotiation signals → deliberate handoff.
- **Readiness** (`lib/sales/predictive.ts`) — 0–100 closing-readiness + band + NBA per
  turn (heuristic, calibrated by outcome logs — not a trained model).

**Two transport implementations** (same contract, under `gateway/`):
- **WAHA** (`gateway/waha/`) — server-gateway (Docker/hosted); per-account session +
  webhook, inline outbound via `/api/wa/waha/inbound` (no bridge needed on Vercel).
- **Chrome MV3 extension** (`gateway/extension/`) — most human fingerprint (real
  browser + rep IP), also does LinkedIn/IG discovery. Not 24/7.

**Honest caveat (in the docs):** both are WA Web automation and violate WA ToS
(Jan 2026 explicitly bans 3rd-party AI chatbots). Mitigation = reply-only + human
pacing + low volume + semi-auto (draft→approve). For scale/safety → official WA
Cloud API.

---

## 8. Discovery / enrichment

Architecture principle: **RPA extracts/profiles; AI only recommends + filters
product-fit.** The unit is a channel-agnostic **Company → People graph** filled from
*any* channel (LinkedIn incl. posts/comments, Maps, IG/FB, marketplace, web/SERP) —
NOT LinkedIn-default.

**Pipeline** (`modules/enrichment/`, `modules/crm/`):

```
discovery_job (query + channel + posture) ─▶ discovery_result (raw lead, savable)
       │ channel: web|linkedin|instagram|maps|directory          │ save to workspace
       │ origin:  manual|mcp|extension                            ▼
       │                                             enrichment_record
       │                                      fields + source + classification
       │                                      (b2c|b2b|unknown) + fit_score(0..1)
       │                                                          │ push
       ▼                                                          ▼
   sourcing:                                        crm.contact (segment,
   - high-volume SERP → server-side SERP API        enrichment_status, fit_score)
     (SerpApi/DataForSEO), NOT the extension           in company_v2 / contact graph
   - behind-login enrich → extension (LinkedIn/IG)
```

- **Extension = per-channel adapter registry** (`EXTRACTORS`): extracts a profile
  behind login → `POST /api/ingest` (`x-ingest-token` per-rep → auto-assign,
  `origin: "extension"`, `workspaceId`).
- **In-extension AI classify** (`POST /api/discovery/classify`) reuses `classifyLead`
  through the **metered** path (server-side key, grounded to the workspace product),
  returning B2B/B2C + score + reason — never a client-side key (so it can't bypass
  the quota/kill-switch guardrails).
- **Taxonomy** (`modules/taxonomy/`): AI classifies crawled companies/people into
  industry + occupation master data (classify-existing-first, auto-create new,
  unique(tenant,slug) + upsert, confidence threshold, dedup/merge).
- All tables are TENANT-grained, workspace-scoped in-app, soft-deletable (crawl +
  enrichment included).

---

## 9. Secrets / config

Central resolver `lib/config/secrets.ts` — **superadmin-managed, DB-first, env
fallback.**

```
getSecret(key):  memory cache (60s) ─▶ DB (platform_setting_v2 "sec.<KEY>", AES-GCM
                                         decrypt) ─▶ process.env[KEY]
                 (a value set in the console WINS over env)
```

- **AES-256-GCM** encryption; a single master key `SECRETS_KEY` (env) — the *only*
  secret that must live in env, alongside the DB URL + `AUTH_SECRET` (chicken-and-egg).
  Stored blob format: `v1.<iv>.<authTag>.<ciphertext>` (base64).
- **Catalog** (`SECRET_CATALOG`) enumerates every manageable key across categories
  AI / Payment / Email / Enrichment / Ingest & WA / Jobs / Flags — e.g.
  `DEEPSEEK_API_KEY`, `MIDTRANS_SERVER_KEY`, `WA_GATEWAY_TOKEN`, `WAHA_BASE_URL`,
  `INNGEST_SIGNING_KEY`, `CREDIT_ENFORCED`, `WA_AUTO_REPLY`.
- Superadmin console (`/api/superadmin/secrets`) sets/clears values;
  `listSecretStatus()` returns masked previews only (`setInDb` / `hasEnv`), never full
  secret values. Clearing a value falls back to env. Helpers: `getSecretBool`,
  `getSecretNumber`.
- Distinct from **tenant BYOK AI keys** (§5), which live encrypted per-tenant in
  `ai_credential.apiKeyEnc` (decrypted by `lib/ai/crypto.ts`), not in the platform
  secret store.

---

## 10. Data flow + deployment

**End-to-end request path (rebuild / DB-backed):**

```
Browser
  │  fetch /api/<resource>
  ▼
Edge middleware (middleware.ts)         — page routes: redirect if unauthenticated
  │
  ▼
Route handler app/api/**/route.ts (runtime="nodejs", THIN)
  │  requirePermission(perm)            — 401/403 envelope; re-resolves role live;
  │                                        tenant-status gate (pending/suspended)
  │  if (!hasDb()) → ok([]) | 503        — graceful no-DB fallback
  │  parseJson / handle()               — {ok,data} | {ok,error} envelope
  ▼
modules/<domain>/service.ts             — business logic, quota, audit, cascade,
  │                                        soft/restore/hard-delete, ServiceError
  ▼
modules/<domain>/repo.ts                — queries, always inside withTenant(ctx)
  ▼
withTenant → BEGIN; set_config(app.tenant_id/user_id/role); … COMMIT
  ▼
Neon Postgres  — RLS (app_user NOBYPASSRLS) filters every row by app.tenant_id
                 (belt-and-suspenders with repo eq(tenantId) filters)
```

**Cross-cutting on every write:** audit rows → `audit_log_v2` (via
`platformRepo.insertAudit`), soft-delete stamps, quota bump. AI writes also log to
`ai_usage`.

**Deployment:**

```
        ┌───────────────────────────── Vercel ─────────────────────────────┐
        │  Next.js 14 (App Router)                                          │
        │   • Edge middleware (auth gate)                                   │
        │   • Node route handlers (runtime="nodejs" for DB/scrypt/AI)       │
        │   • Inngest handler /api/inngest (background jobs)                │
        └───────┬───────────────────────┬───────────────────┬──────────────┘
                │ APP_POSTGRES_URL       │ metered AI        │ webhooks
                │ (app_user, RLS)        │ (BYOK/platform)   │ (Midtrans, ESP,
                ▼                        ▼                   │  Stripe, WAHA)
         Neon Postgres            AI providers               ▼
        (serverless, pooled)   (DeepSeek / Anthropic /   external transports:
         + non-pooling for      OpenAI / Google)          WAHA server-gateway
         migrations/RLS                                   or Chrome extension
                                                          (poll outbox / push inbound)
```

- **Connection resolution** (`lib/db/client.ts`): prefers `APP_POSTGRES_URL` (RLS
  role), then any `*_POSTGRES_URL` (Vercel Marketplace prefix), then pooled/non-pooled
  canonical URLs. Migrations use the inverse (non-pooled first). `drizzle.config.ts`
  manually loads `.env.local`.
- **Migrations:** additive rebuild migrations auto-apply via
  `scripts/apply-rebuild-migration.mts` (aborts on destructive DDL); `db:push` and
  RLS `enable-rls.sql` are gated manual steps (run as owner /
  `APP_POSTGRES_URL_NON_POOLING`). See `drizzle/rls/README.md`.
- **Build caveats:** builds skip type-check + ESLint (`next.config.mjs`) — a green
  build is not type-clean; verify with `npm run lint` / `npx tsc --noEmit`. Use
  `npm run preview` for demos (client nav is instant; `dev` compiles per-route on
  first visit). No test suite exists.

---

## Appendix — where things live

| Concern | Path |
|---|---|
| Tenant/RLS context | `lib/db/tenant-context.ts` |
| DB client + `hasDb()`/`usingRlsRole()` | `lib/db/client.ts` |
| RLS policies | `drizzle/rls/enable-rls.sql` (+ `README.md`) |
| Auth (NextAuth split) | `lib/auth/auth.ts` · `lib/auth/auth.config.ts` · `middleware.ts` |
| Session→ctx re-resolution | `lib/auth/session-context.ts` |
| RBAC | `lib/rbac/permissions.ts` · `lib/rbac/guard.ts` |
| Passwords (scrypt) | `modules/auth/password.ts` |
| API envelope + pagination | `modules/_shared/api.ts` |
| Domain services (reference) | `modules/tenant/service.ts` · `modules/auth/service.ts` |
| AI meter / registry / adapters | `lib/ai/meter.ts` · `registry.ts` · `adapters.ts` |
| Kill-switch / credit | `lib/admin/kill-switch.ts` · `lib/billing/credit.ts` |
| Plans / quota / payments | `lib/billing/plans.ts` · `payments.ts` · `quota-packs.ts` |
| WhatsApp brain / store | `lib/wa/orchestrator.ts` · `lib/wa/store.ts` · `lib/sales/*` |
| WA transports | `gateway/waha/` · `gateway/extension/` |
| Discovery/enrichment | `modules/enrichment/` · `modules/taxonomy/` |
| Secrets/config | `lib/config/secrets.ts` |
| Per-feature explainers | `docs/01`–`docs/52`, `docs/wa-gateway-*`, `docs/rebuild/*` |
| Trackers | `progress.md` (Closing-Flow) · `loop-progress.md` (rebuild) |
```
