# Rebuild Audit — Consolidated (Sainskerta Loop Phase 05)

Single source of truth that rolls up the five per-dimension adversarial audits:
[`audit-security-authz.md`](./audit-security-authz.md),
[`audit-multitenant.md`](./audit-multitenant.md),
[`audit-perf-db.md`](./audit-perf-db.md),
[`audit-a11y-ux.md`](./audit-a11y-ux.md),
[`audit-code-rules.md`](./audit-code-rules.md).

Date: 2026-06-29 · Scope: `modules/**`, rebuild `app/api/**` + `app/(app)/**` + auth
pages, `lib/auth/**`, `lib/db/**`, `lib/rbac/**`, `lib/ai/**`, `middleware.ts`,
`drizzle/rls/**`, `scripts/apply-rebuild-migration.mts`.

---

## Executive summary

The rebuild is, on the dimensions that are mechanical and verifiable, **unusually
disciplined**: `tsc --noEmit` is clean project-wide; every rebuild route flows through
`requirePermission`/`getTenantContext` and the `{ ok, data } | { ok, error }` envelope
via `handle()`; every repo conjoins `eq(table.tenantId, ctx.tenantId)` AND
`deleted_at IS NULL`, stamps `tenantId` on writes with the spread *before* the pin
(payloads can't override tenant), and never reads the tenant id from client input; no
foreign keys / camelCase identifiers / string-built SQL / direct provider calls /
`as any` / TODOs in `modules/`; passwords are scrypt + constant-time; AI is reached only
through `lib/ai/meter`. The app-level tenant filtering holds today across a full
programmatic scan — **zero** id-only or ref-column lookups on a tenant table were found
missing a tenant predicate.

The serious problems cluster in three places, and **two of them are independently flagged
by multiple auditors**, which raises confidence they are real:

1. **The authentication layer ships an active backdoor.** A hardcoded demo-account list
   — including a plaintext `superadmin@mairasales.com / super1234` that resolves to
   `isSuperadmin: true` — is wired into the live Auth.js `authorize()` path with **no
   environment gate**, so it grants full cross-tenant platform access in production
   (flagged CRITICAL by both security-authz C1 and code-rules C1). A second auth-layer
   CRITICAL returns the password-reset token in the HTTP response body, which is a
   one-request account-takeover oracle for any known email.

2. **There is no database-level tenant isolation.** RLS is the documented "defense in
   depth" layer, but it is (a) never applied — the only DDL applier aborts on
   `ALTER TABLE`, which is all `enable-rls.sql` contains — and (b) targets **legacy**
   table names, not the rebuild `*_v2` tables, so it would no-op even if run (flagged by
   multitenant C1, code-rules H1, security-authz M2). Isolation therefore rests entirely
   on per-repo discipline with **no backstop**: one forgotten predicate in any future
   query is a silent cross-tenant leak. Related: tenant suspend/pending/expired is
   enforced **client-side only** (security-authz H1), and stale role/superadmin/tenant
   claims in the JWT are never re-validated (H2), so revocation is cosmetic for non-AI
   paths.

3. **The frontend has brand-wide accessibility defects.** Every Coral Sunset CTA fails
   WCAG contrast with white text (primary coral 2.60:1 vs the 4.5:1 floor), affecting the
   default button and active nav on every screen (a11y-ux C1); and every hand-rolled
   drawer/modal — the primary create/edit and destructive-confirm surface — lacks dialog
   semantics, focus trap, autofocus, and consistent scroll-lock (C2).

Performance has **no CRITICAL** findings but several real scaling cliffs (unbounded list
queries, missing `deleted_at` partial indexes, N+1 cascade fan-out) that are fine for a
demo and would bite a real tenant. None of those block deploy.

This remains a prototype, but the auth backdoor and the reset-token oracle are
genuine production-grade security holes that must not ship as-is regardless of "demo"
framing. They are cheap to fix.

**Aggregate severity (de-duplicated across the 5 dimensions):**

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH     | 13 |
| MEDIUM   | 18 |
| LOW      | 18 |

(Per-dimension raw totals before de-dup: CRITICAL 6, HIGH 16, MEDIUM 22, LOW 18. The RLS
gap is counted once though it appears as multitenant-C1 / code-rules-H1 / security-M2; the
hardcoded-superadmin backdoor is counted once though it appears as security-C1 /
code-rules-C1.)

---

## Prioritized findings (CRITICAL first)

| # | Sev | Dimension | File:line | Issue | Recommended fix | Effort |
|---|-----|-----------|-----------|-------|-----------------|--------|
| 1 | CRITICAL | security-authz / code-rules | `lib/auth/auth.ts:74-89`, `lib/auth/demo-accounts.ts:18-58,61,70-72` | Hardcoded demo-account fallback (incl. plaintext `superadmin@mairasales.com / super1234` → `isSuperadmin:true`, `role:"superadmin"`, `tenantStatus:"active"`) is wired into the live `authorize()` with **no `NODE_ENV` gate**; fires whenever the real credential check returns null, so it grants full cross-tenant platform access in production. Non-constant-time plaintext compare. | Gate behind a default-off, prod-impossible flag (`NEXT_PUBLIC_AI_PROVIDER==="mock" && NODE_ENV!=="production"`), or drop the branch and seed demo users as real scrypt-hashed `app_user` rows via `db:seed`. Never emit `isSuperadmin:true` from a hardcoded record. | S |
| 2 | CRITICAL | security-authz | `app/api/auth/password-reset/route.ts:13-19`, `modules/auth/service.ts:134-155` | `requestReset()` returns the raw reset token in the JSON response; any anonymous caller can request a victim's token by email and complete reset → full account takeover with only the email. Amplified by no rate limiting (#11). | Never return the token; deliver out-of-band (email) and return only `{ requested:true }`. Until a mailer exists, log server-side behind the non-prod gate from #1. | S |
| 3 | CRITICAL | multitenant / code-rules / security-authz | `drizzle/rls/enable-rls.sql:18-69`, `lib/db/tenant-context.ts:24-37`, `scripts/apply-rebuild-migration.mts:35-48`, `drizzle/rls/README.md:1-12` | RLS is the documented isolation backstop but is (a) never applied — the only DDL applier aborts on `ALTER TABLE`, which is all `enable-rls.sql` is — and (b) enumerates **legacy** table names (`deals`, `contacts`, `company`…), not the rebuild `*_v2` tables, so it would no-op even if run. The `app_user` NOBYPASSRLS role is also unwired (`APP_POSTGRES_URL` unset → owner bypasses RLS). Net: zero DB-level isolation; one forgotten `eq(tenantId)` = silent cross-tenant leak with no backstop. | Rewrite `enable-rls.sql` to the real rebuild table names (every `tenant_id` table); add + wire a NOBYPASSRLS `APP_POSTGRES_URL` connection in `lib/db/client.ts`; apply RLS via a dedicated path (not the additive-only guard); add a two-tenant isolation test to CI. Until then treat app-level filtering as the sole control and code-review every new query. | L |
| 4 | CRITICAL | a11y-ux | `app/globals.css:15-16,28-29` (+ success/amber/destructive swatches) | Every Coral Sunset CTA fails WCAG contrast with white text: primary coral **2.60:1**, teal 2.49:1, success 2.30:1, amber+white 2.13:1, destructive 3.78:1 (floor is 4.5:1 normal / 3:1 UI). This is the default `<Button>` + every active nav item — brand-wide, every screen; unreadable for low-vision users and on bright field-sales phone screens. | Darken action tokens until white clears 4.5:1 (coral ≈ `L 48-50%`, teal/success ≈ 33%); give amber buttons the already-AA-safe dark foreground. Re-verify each pair with a contrast checker; hue is preserved, only lightness moves. | M |
| 5 | CRITICAL | a11y-ux | `app/(app)/content/page.tsx:1789-2000`, `app/(app)/reports/page.tsx:680-818,1219-1376`, `app/(app)/escalations/page.tsx:1541-1544` (+ all module drawers) | Every hand-rolled drawer/modal — the primary create/edit and destructive-confirm surface — lacks `role="dialog"`/`aria-modal`/`aria-labelledby`, has no focus trap or autofocus, leaves the background reachable, and locks body scroll inconsistently (some pages do, some don't). Keyboard/SR users can't reliably operate any CRUD or purge flow. | Replace with the existing Radix `Dialog`/`Sheet` in `components/ui/` (dialog role, focus trap+return, scroll-lock, Esc for free). If a custom shell stays, add the ARIA, move focus on open, trap Tab, restore focus on close, lock scroll uniformly. | L |
| 6 | HIGH | security-authz | `app/(app)/layout.tsx:31-46`, `lib/auth/session-context.ts:9-14`, `lib/rbac/guard.ts:17-26` | Tenant suspend / pending / expired is enforced **client-side only** (`AppLayout` fetch + `router.replace`). The guard/middleware/services never check `tenantStatus`; a suspended tenant holds a valid JWT and can call every non-AI `/api/*` CRUD endpoint directly. Only AI is gated (meter checks `isTenantActive` independently). Defeats the kill-switch + pending-activation model. | Resolve live tenant status server-side in `requirePermission`/`getTenantContext` and 403 non-active tenants; exempt only `platform.manage` and the status/onboarding/billing recovery endpoints. | M |
| 7 | HIGH | security-authz | `lib/auth/auth.config.ts:22-46`, `lib/auth/session-context.ts:9-14` | `role`, `tenantId`, `isSuperadmin`, `tenantStatus` are copied into the JWT once at login (`jwt` callback only runs `if (user)`) and trusted verbatim thereafter. Revoking membership, demoting a superadmin, suspending a tenant, or revoking an `auth_session` has no effect until token expiry/re-login — the persistent session-revoke list is cosmetic (no request consults it). | Re-resolve auth-critical fields (membership role, is_superadmin, tenant status, session-not-revoked) server-side per request in `getTenantContext()`, or drastically shorten JWT `maxAge` and consult `auth_session` each request. | M |
| 8 | HIGH | security-authz | `app/api/auth/register/route.ts`, `app/api/auth/password-reset/route.ts`, `.../confirm/route.ts`, `lib/auth/auth.ts:47` | No rate limiting on any unauthenticated endpoint: `register` mass-creates pending tenants/users + floods audit log; `password-reset` is an unthrottled token oracle (amplifies #2); `authorize` allows unlimited password guessing against real accounts. | Add IP+identifier rate limiting (in-memory/Upstash) to all four; CAPTCHA on register. | M |
| 9 | HIGH | multitenant | `modules/superadmin/service.ts:73-108`, `modules/superadmin/repo.ts:41-56`, `modules/tenant/repo.ts:31-37,122-137` | Cross-tenant superadmin service methods (`overview`/`listTenants`/`listUsers`/`recentAudit(null)`) read all tenants with **no in-service `is_superadmin` guard** — they trust the caller; only the route layer (`platform.manage`) protects them today. Any future caller invoking the service without the route guard leaks all tenants. | Thread the caller's `TenantContext`/role into the cross-tenant methods and assert `ctx.role==="superadmin"` at the top; keep the route guard too. | M |
| 10 | HIGH | multitenant | `modules/superadmin/service.ts:28-30,192,238`, `app/api/admin/route.ts:52-53,71` | `targetCtx(tenantId)` mints a `role:"superadmin"` context for any client-supplied `tenantId` — a full RLS-bypass token once RLS lands — guarded only by the route's `platform.manage` check, with no second assertion that the acting principal is genuinely a superadmin. Combined with #9, one missing route guard = write into any tenant. | Have `targetCtx`/any superadmin-context factory require proof the operator is a superadmin (look up `app_user.is_superadmin` for the operator, or thread+assert the verified caller role). Don't synthesize `superadmin` from a bare `tenantId`. | M |
| 11 | HIGH | code-rules | `lib/rbac/guard.ts:19-25` + every route (e.g. `app/api/companies/route.ts:11,21`, `app/api/contacts/[id]/route.ts:16,25,40`) | `requirePermission` correctly returns 401 (no session) vs 403 (wrong role), but all ~339 handlers discard it and `return fail("Forbidden",403)`, so unauthenticated callers always get 403. The guard's own `g.error` body is `{ error }` not the `{ ok:false, error }` envelope, so envelope-consistency only holds because routes throw it away — the docstring's `return g.error` usage would break the invariant (trap for the next author). | Reshape the guard to emit the `{ ok:false, error }` envelope with the correct 401/403 status and `return g.error;`, centralized so a future route can't regress the envelope. | M |
| 12 | HIGH | perf-db | all `modules/*/schema.ts` index blocks (e.g. `modules/crm/schema.ts:70-222`, `modules/inbox/schema.ts:65-101`) | `deleted_at` is filtered on every read but indexed nowhere. As soft-deleted rows accumulate, hot tables (`message_v2`, `contact`, `deal`, `activity`) degrade to wider scans and the `tenant_id`-only index loses selectivity. | Add partial indexes matching the live-read shape, e.g. `CREATE INDEX contact_live_idx ON contact (tenant_id, created_at DESC) WHERE deleted_at IS NULL;` and a `(tenant_id, conversation_id, created_at) WHERE deleted_at IS NULL` on `message_v2`. | M |
| 13 | HIGH | perf-db | repos: `modules/crm/repo.ts:39,151,558,696`, `modules/inbox/repo.ts:182,232`, `modules/outreach/repo.ts:571,700`; routes/pages: `app/api/messages/route.ts:20`, `app/(app)/inbox/page.tsx:258,263`, `app/(app)/contacts/page.tsx:223,228` | Unbounded list queries everywhere — no `list*` repo or its caller applies `LIMIT`/pagination. A big tenant ships its entire table (worst: `message_v2`, every bubble of an old thread) over the wire on each page load. | Add cursor/keyset pagination (`WHERE created_at < ? … LIMIT n`) to `list*` repos; thread `limit`/`cursor` through routes; `listMessages` defaults to most-recent N with lazy older-load. | M |
| 14 | HIGH | perf-db | `modules/crm/service.ts:246-254,805-841`, `lib/db/tenant-context.ts:27-37` | N+1 cascade fan-out in CRM soft-delete/restore: deleting a company loops contacts → deals → activities, and **each** repo call opens its own `withTenant` transaction (BEGIN + 3×`set_config` + COMMIT). Hundreds of children = thousands of round-trips, and the cascade is **not atomic**. | Push cascades into set-based repo helpers (`setDealsDeletedByContactIds`, `setActivitiesDeletedBySubjects(...)`, mirroring the existing `setStagesDeletedByPipeline`/`setMessagesDeletedByConversation`) and run the whole cascade in one `withTenant` transaction. | M |
| 15 | HIGH | perf-db | `modules/reports/service.ts:228-247`; mutation paths e.g. `modules/crm/service.ts:217,240,851` | Multi-transaction fan-out on the read-hot dashboard (`overview` runs 8 aggregates, each its own `withTenant` = 8× BEGIN/set_config×3/COMMIT ≈ 32 extra round-trips) and every mutation pays the BEGIN/COMMIT tax 2-3× (get-then-write-then-audit as separate txns). | Run all `overview` aggregates inside a single `withTenant(ctx, tx => Promise.all([...tx...]))`; fold existence-check + write (+ audit) into one transaction (also makes RMW atomic). | M |
| 16 | HIGH | a11y-ux | 66 `<label>` across 21 pages vs 17 `htmlFor`; roots: `content/page.tsx:1731-1762` (`Field`/`SelectInput`), `reports/page.tsx:711,725,751,765` | Form labels aren't programmatically associated with inputs (no `htmlFor`/`id`, no wrapping). SR announces inputs as unlabeled "edit text"; label clicks don't focus. Affects nearly every create/edit drawer (templates, plans, reports, cadences, escalations, field visits, listings). | Give each control a stable `useId()` id and point the label at it (or wrap the control). Fix the 3 shared helpers (`Field`, `SelectInput`, inline `reports` labels) once and most pages inherit. | M |
| 17 | HIGH | a11y-ux | `app/(app)/inbox/page.tsx:526-529,855` | The 2-pane inbox isn't responsive: a fixed `w-[336px] shrink-0` list sits beside the thread inside `overflow-hidden`, squeezing the thread to ~24-54px on a 360-390px phone — composing is unusable. No single-pane/back-button mobile mode. Inbox is a daily-driver and the product targets field sales on phones. | Below `md`/`lg` render a single pane: `w-full md:w-[336px]` list, hide it when a thread is open, push thread full-width with a back affordance. | M |
| 18 | HIGH | a11y-ux | `app/(app)/layout.tsx:67`, `components/layout/side-nav.tsx` | No skip-to-content link anywhere (0 `skip`/`sr-only` hits) and `<main>` has no `id`/`tabIndex`; no focus reset on route change. Keyboard users Tab through ~17 nav links + topbar on every page before reaching content. | Add a visually-hidden-until-focused "Lewati ke konten" link as the first focusable element targeting `<main id="main" tabIndex={-1}>`; move focus to `#main` on pathname change. | S |
| 19 | HIGH | a11y-ux | `app/globals.css` `--muted-foreground: 20 6% 45%` used at `/60`: `side-nav.tsx:217,224,357`, `settings-nav.tsx:59`, `reports/page.tsx:719,759` | `muted-foreground` is 4.81:1 on white (fails on the warm `#FFF8F5` background and on `--muted`), then used at `/60` (measured **2.32:1**) for nav section headers and input placeholders, and lighter still for tiny captions — unreadable for low-vision users at `10-11px`. | Don't render meaningful text below ~4.5:1: use solid `muted-foreground` (not `/60`) for headers/placeholders and darken the base a step (`20 6% 40%`) to clear AA on the warm canvas. | S |
| 20 | MEDIUM | a11y-ux | `content/page.tsx:1831-1836`, `reports/page.tsx:700-705`, `escalations/page.tsx:1541-1544`, `content/page.tsx:1411-1431` | 18 icon-only `<X>` close buttons (+ calendar prev/next) across 12 pages have no accessible name; some trash buttons set `title` (partial) but close/calendar arrows have neither `aria-label` nor `title` — announced as just "button". | Add Indonesian `aria-label` ("Tutup", "Bulan sebelumnya/berikutnya", "Hapus") to every icon-only control; bake into the shared close button. | S |
| 21 | MEDIUM | security-authz | `app/api/tenant/members/[id]/route.ts:15-44` | Privilege escalation: member-role `PATCH` accepts any `body.role` typed as `Role`, no allow-list and no role-ceiling, so a `tenant_admin` can promote a member (or self) to `tenant_owner` and gain `tenant.billing`; arbitrary strings can also land in the column. This is the live members route the rebuild settings/team page calls. | Validate `role` against an explicit membership-role allow-list and reject any role above the actor's; make owner-transfer a distinct owner-only action. | S |
| 22 | MEDIUM | security-authz | `modules/_shared/api.ts:46-59`; `app/api/tenant/members/[id]/route.ts:40` | Work done outside `handle()` (e.g. `await req.json()` before the wrapper, or routes building responses manually) leaks internals; the legacy members route returns `error: String(err)` raw to the client. | Ensure every handler body (incl. JSON parsing) runs inside `handle()`; never return `String(err)`/`err.message`; audit for that pattern. | S |
| 23 | MEDIUM | code-rules | 94 routes (e.g. `app/api/companies/route.ts:18`, `app/api/contacts/[id]/route.ts:24`, `app/api/tenant/[id]/quota/route.ts:38`) | 94 routes call bare `await req.json()`; `handle()` only special-cases `ServiceError`, so a malformed/empty body's `SyntaxError` becomes a 500 "Internal error" instead of 400. Only 18 guard it with `.catch(()=>({}))`. | Add a `parseJson(req)` helper in `_shared/api.ts` that throws `ServiceError("Body tidak valid",400,"bad_json")`; use it everywhere instead of raw `req.json()`. | M |
| 24 | MEDIUM | multitenant | `modules/crm/service.ts:300-301,591-592` | Soft refs `workspace_id`/`product_id` are written straight from input with no tenant-existence validation (unlike `companyId`/`contactId`/`pipelineId`/`stageId`), so a caller can attach another tenant's id. Inert for reads today (tenant-scoped), but it corrupts the integrity the service claims and becomes a leak the moment any path joins the ref by id without re-scoping. | Validate `workspaceId`/`productId` via their repos the same way other refs are validated, in create/update Contact/Deal and analogous services. | S |
| 25 | MEDIUM | multitenant / security-authz | `lib/db/tenant-context.ts:18-37`; `app/api/tenant/[id]/quota/route.ts:16-18` | `withTenant` sets RLS context on every call but provides **zero** isolation while RLS is off (#3) — it looks protective but is "a harmless transaction wrapper." A reader could assume a query inside it is tenant-safe without an `eq(tenantId)` predicate. The superadmin-role context is load-bearing only once RLS ships. | Ship #3, or until then add a dev-only assertion/lint that every tenant-scoped `select/update/delete` inside `withTenant` carries a `tenant_id` predicate; document loudly that `withTenant` is currently inert. | M |
| 26 | MEDIUM | multitenant | `app/api/wa/gateway/inbound/route.ts:48-186`, `app/api/wa/gateway/outbox/route.ts` | Legacy WA gateway routes write tenant rows with raw `db.insert` (no `withTenant`) into the **legacy** `conversations`/`messages` tables, not the rebuild `*_v2`. Tenant is resolved server-side via `ownerOfSession` (no cross-tenant write today), but they never set `app.tenant_id`, so they'd break/mis-scope once RLS lands; half-in/half-out of the rebuild. | When migrating WA onto the rebuild modules, route writes through the repos (`withTenant`) using the `ownerOfSession`-resolved context. Until then, document as legacy + RLS-excluded. | M |
| 27 | MEDIUM | multitenant | `lib/ai/meter.ts:4,85-97,156-168`, `lib/ai/registry.ts:1-52` | The meter/registry's own comments lean on RLS as the second layer for `ai_usage`/`ai_credential`/`tenant_active_model`, but those are legacy tables not covered by the (never-applied) RLS file. A BYOK cross-tenant key read has no DB backstop — the single `eq(tenantId)` on the credential select is all that stops one tenant decrypting another's key. | Same as #3 (enable RLS on these tables with a NOBYPASSRLS role); keep the explicit `tenantId` filters, don't relax them. | M |
| 28 | MEDIUM | code-rules | `modules/onboarding/repo.ts:85-157`, `app/api/onboarding/verticals/[id]/route.ts:25-32`, `.../modules/[id]/route.ts:25-32` | `vertical` and `module_catalog` expose softDelete + restore but **no hardDelete/purge** and no trashed listing — the soft-delete contract is half-applied and self-inconsistent (restore is exposed but you can't purge). | Add `hardDeleteVertical`/`hardDeleteModule` + a `?purge=1` branch (guarded by `platform.manage`) + trashed list routes for parity, or consciously make them restore-only and drop the restore routes. | S |
| 29 | MEDIUM | code-rules / multitenant | `modules/superadmin/repo.ts:41-54` | `recentAudit(null)`/`countAudit(null)` read every tenant's audit trail on unscoped `db` with no in-repo/in-service `is_superadmin` assertion; only the route guard protects it, and RLS doesn't cover `audit_log_v2`. Single-layer control over a cross-tenant data path; `meta` often contains other tenants' identifiers. | Require an explicit `assertSuperadmin(ctx)` in the service before any unscoped audit read; include `audit_log_v2` in the corrected RLS list with a superadmin-only policy for `tenant_id IS NULL` rows. | S |
| 30 | MEDIUM | perf-db | `modules/outreach/repo.ts:181-195`, `modules/tenant/repo.ts:221-229` | In-memory `count()` (`countSteps`, `countActiveMembers` select all ids and return `rows.length`) instead of SQL `COUNT(*)`; `countSteps` runs on every step create/delete/restore via `syncStepCount`. | Use drizzle `count()` aggregate and read `rows[0].n`. | S |
| 31 | MEDIUM | perf-db | `modules/outreach/service.ts:290,324,333,341,346-349` | `syncStepCount` doubles writes on every step mutation: a full-scan `countSteps` (M1) **plus** an `updateCadence` to persist `step_count`, each its own transaction — write amplification on a hot path. | Compute `step_count` with SQL `count()` only when listing cadences, or do an atomic `step_count = step_count ± 1` in the same transaction as the mutation. | S |
| 32 | MEDIUM | perf-db | `modules/enrichment/service.ts:265-285` | Per-row inserts in discovery ingest: a 200-result crawl does 200 sequential single-row inserts, each its own `withTenant` transaction, in the request path of the discovery POST. | Batch into one multi-row `insert().values(rows)` inside one `withTenant` transaction (also makes "all results or none" atomic). | S |
| 33 | MEDIUM | perf-db | `modules/sales/service.ts:369-379` | `seedTechniques` fires 17 sequential upsert transactions on the seed path (idempotent/infrequent, but 17× round-trip ceremony). | Single batched `insert().values(17 rows).onConflictDoUpdate(...)` in one transaction. | S |
| 34 | MEDIUM | perf-db | `modules/tenant/repo.ts:139-146`, `schema.ts:31-43` | Login `getUserByEmail` filters `deleted_at` but the unique index is on `email` alone (not fully index-covered). Low-volume but it's the auth hot path. | Optional partial unique index `(email) WHERE deleted_at IS NULL` (also lets a soft-deleted email re-register without unique-violation). | S |
| 35 | MEDIUM | perf-db | `modules/tenant/repo.ts:210-218`, `schema.ts:85` | `firstMembershipForUser` runs on every login with `ORDER BY created_at DESC LIMIT 1` but only a `(user_id)` index, so Postgres sorts the matched rows. Minor (≈1-5 rows/user) but hot. | Index `(user_id, created_at DESC) WHERE deleted_at IS NULL`, or accept as-is. | S |
| 36 | MEDIUM | perf-db | `modules/auth/schema.ts:38,44` | `password_reset.token` has both a `.unique()` constraint and a redundant non-unique `password_reset_token_idx` on the same column — dead weight that slows writes. | Drop `password_reset_token_idx`; keep the unique index. | S |
| 37 | MEDIUM | a11y-ux | `content/page.tsx:365-375,1751-1762`, `reports/page.tsx:260-267`; duplicated components across content/reports/escalations/enrichment/field/retention/marketplace | Inconsistent Esc-to-close/backdrop dismissal (Confirm/Purge modals often only close on backdrop, not Esc), native `<select>` chevron uses `ChevronRight` rotated vs the system `ChevronDown`, and `StatCard`/`TabButton`/`ConfirmModal`/`PurgeModal`/`DrawerShell` are copy-pasted per page — guaranteeing a11y/visual drift and forcing N-fold fixes. | Extract shared `Drawer`/`ConfirmDialog`/`PurgeDialog`/`StatCard`/`Tabs`/`CountPill` into `components/shared/` (or adopt Radix per #5); centralize Esc + scroll-lock; use `ChevronDown`. | M |
| 38 | MEDIUM | a11y-ux | `reports/page.tsx:1110-1144,424`, `dashboard/page.tsx:84-90` | Chart bars and status badges encode meaning by color only (won=green/lost=red/open=coral); invisible to color-blind users (bars show the number, mitigating data loss, but win/lost/open carry no text/shape cue). | Add a text/shape/pattern cue alongside color for win/lost/status. | S |
| 39 | LOW | multitenant / security-authz | `lib/rbac/guard.ts:17-26`, `lib/auth/auth.ts:25-37,65,84` | Superadmin gate is role-derived (`platform.manage` ← `superadmin` role ← `user.isSuperadmin`), functionally equivalent but an indirection; the offline path can mint `isSuperadmin:true` from `account.role==="Superadmin"`. | For superadmin-only routes additionally assert `session.user.isSuperadmin === true`. | S |
| 40 | LOW | multitenant | `modules/branding/repo.ts:18-62`, `schema.ts:14-45` | `brandingRepo.getByUserId(userId)`/`clear(userId)` take a raw `userId` with no enforcement it equals the session user; a route bug passing a client-supplied `userId` would read/reset another user's theme (low-impact: colors/logo). Grain itself (per-user) is correct. | Resolve `userId` from the session inside the branding service/route only; never from the body. Verify `app/api/branding/theme/route.ts`. | S |
| 41 | LOW | multitenant | `modules/superadmin/repo.ts:22-49`, `enable-rls.sql:63-69` | Audit rows accept `tenantId:null` and the RLS policy that would scope tenant-attributed audit targets legacy `audit_log` not `audit_log_v2`, so audit isolation has no DB backstop; `meta` often carries other tenants' identifiers. | Include `audit_log_v2` in the corrected RLS list (superadmin-only for `tenant_id IS NULL`) and guard `recentAudit(null)` per #9/#29. | S |
| 42 | LOW | security-authz | custom mutating routes (next-auth session cookie + `application/json`) | CSRF mitigated in practice (JSON content-type blocks cross-site form posts), but no explicit CSRF token / origin assertion on custom routes; relaxing any route to form-encoded bodies opens CSRF. | Confirm session cookie is `sameSite=lax|strict` (next-auth default) and add an origin-check helper for mutations. | S |
| 43 | LOW | security-authz | `app/api/wa/outbox/sendable/route.ts:12-18` | An externally-polled gateway route is gated by `requirePermission("data.read")` — i.e. it needs a human user's cookie (credential-sharing smell) or is mis-documented; contrast the legacy `x-wa-gateway-token` routes. | Give the machine poller a scoped service token instead of a human session. | S |
| 44 | LOW | security-authz | `lib/auth/auth.config.ts:19` | `trustHost: true` unconditionally + no explicit `AUTH_URL`; fine behind Vercel but trusts the inbound Host header for callback construction → host-header injection risk on a misconfigured edge. | Set `trustHost` only on the known platform; pin `AUTH_URL` in prod. | S |
| 45 | LOW | security-authz | public routes return `503 {code:"no_db"}` (`app/api/auth/register/route.ts:14`) | Unauthenticated DB-availability oracle: distinct `no_db` envelope to anonymous callers leaks deployment/DB state. | Return a generic 503 without the `no_db` code on unauthenticated endpoints. | S |
| 46 | LOW | code-rules | `app/api/tenant/[id]/quota/route.ts:16-18,26,40` | `targetCtx` forges a `role:"superadmin"` context straight from the URL path param; safe today (gated by `platform.manage`) but the "synthesize elevated context from request input" shape becomes an escalation if copied into a weaker-guarded route. | Centralize as a `superadminTargetCtx(targetTenantId, operator)` helper that re-asserts `operator.isSuperadmin`. (Same root as #10.) | S |
| 47 | LOW | code-rules | `lib/auth/auth.ts:18,82` | Demo path pins users to hardcoded `tenantId:"t_default"` that may not exist as a real tenant row → "logged in but everything empty" / writes attach to a phantom tenant. | Seed a real `t_default` tenant+membership if the demo path survives; otherwise remove the constant (evaporates with #1). | S |
| 48 | LOW | code-rules | `middleware.ts:15-25` | Entire `/api/*` namespace is treated public ("API routes handle their own auth"); verified true for the rebuild, but one forgotten guard = a fully exposed endpoint with nothing upstream, and legacy routes get no protection. | Keep public prefixes explicit and default the rest of `/api` to authenticated at middleware, OR add a CI check that every mutating `route.ts` imports a guard. | M |
| 49 | LOW | code-rules | `scripts/apply-rebuild-migration.mts:38,40-43` | The additive-only destructive-DDL guard is a regex (`\s+` between keywords) that comment/format-interrupted DDL can evade and that also blocks legitimate `ALTER TABLE ... ADD COLUMN`. Low risk (guarded manual dev tool, atomic + rollback). | Normalize whitespace/strip comments before matching, or parse the DDL. | S |
| 50 | LOW | perf-db | `modules/superadmin/repo.ts:22-39` (audit on raw `db`, inline per mutation) | Every successful mutation pays a synchronous audit insert in the request path, serial with the response; `audit_log_v2` has no retention/partitioning so it grows unbounded. | Acceptable for a prototype; if latency matters, fire-and-forget/batch the insert and plan retention/partitioning. | S |
| 51 | LOW | perf-db | `modules/auth/repo.ts:26` (sessions/resets never deleted) | `auth_session`/`password_reset` only mark `revoked_at`/`used_at`, never purge; `expires_at` stored but no sweep — `listSessionsForUser` scans an ever-growing table; index bloats with dead rows. | Periodic purge (cron/Inngest) of `revoked_at IS NOT NULL OR expires_at < now()`, or a partial index `(user_id) WHERE revoked_at IS NULL`. | S |
| 52 | LOW | perf-db | `app/(app)/inbox/page.tsx:261-272`, `app/(app)/contacts/page.tsx:226-237` | Client-side full-table joins (fetch all contacts→map, all companies→map); not a DB N+1 but pairs with #13 — both sides unbounded, so join cost scales with total rows regardless of what's visible. | Once #13 adds pagination, resolve names server-side for the visible slice or fetch only referenced ids (`/api/contacts?ids=`). | S |
| 53 | LOW | a11y-ux | `reports/page.tsx:1135`, `pending/page.tsx:131`, skeletons | Bar `transition-[width] duration-700`, `animate-pulse` skeletons, and `animate-ping` don't gate on `prefers-reduced-motion` (the login page already models the gate). | Wrap long/looping animations in a `motion-reduce:` variant or `useReducedMotion()`. | S |
| 54 | LOW | a11y-ux | `app/register/page.tsx:291` | "Pilih usage / vertical" `<label>` has no control association; the group already has `aria-label`, so it's an orphan label (redundant, not broken) that trips strict checkers. | `aria-hidden` the visual label (keep the group's `aria-label`) or wire `aria-labelledby` from group to label id. | S |
| 55 | LOW | a11y-ux | `side-nav.tsx:133-137,461` | Notifications/KPIs are hardcoded illustrative constants (`NOTIFS`) with a permanent red unread dot that never clears — UX-honesty issue (always-on badge) and a "no mock data" concern. | Wire to a real source or remove the always-on unread indicator. | S |
| 56 | LOW | a11y-ux | `components/layout/page-header.tsx:23,31` | `PageHeader` H1 is fixed at `text-[28px]` (no responsive step-down) and title+actions share a row only from `sm:`; long titles crowd on 320-360px. | Make H1 responsive (`text-2xl sm:text-[28px]`) and let the action wrap below the title on the smallest breakpoint. | S |

Effort key: **S** ≈ hours / single file · **M** ≈ a day / a few files or a pattern rollout · **L** ≈ multi-day / migration + role + CI test.

---

## VERDICT

**The rebuild is NOT safe to deploy to a real (multi-tenant, internet-facing)
environment as-is.** It is safe to keep running as a local/internal demo. The blockers are
few, concentrated, and cheap — most of the codebase is genuinely solid (clean types, a
consistent guard/envelope/tenant-filter discipline that a full programmatic scan confirms
holds today). What stops a real deploy is a small set of true security holes plus
accessibility defects that make the app unusable for a real user class on the product's own
target device.

### Must-fix-before-deploy

1. **#1 — Remove/gate the hardcoded superadmin backdoor** (`lib/auth/auth.ts:74-89`).
   Active in all environments today; grants full platform access in prod. Effort: S.
2. **#2 — Stop returning the password-reset token in the HTTP response**
   (`app/api/auth/password-reset/route.ts:13-19`). One-request account takeover from a
   known email. Effort: S.
3. **#6 — Enforce tenant suspend/pending/expired server-side**
   (`lib/rbac/guard.ts` / `getTenantContext`). Today the kill-switch is client-side only;
   a suspended tenant can call every non-AI CRUD endpoint. Effort: M.
4. **#8 — Add rate limiting to the unauthenticated auth endpoints**
   (register / password-reset / confirm / authorize). Required for #2's fix to fully hold
   and to stop mass-create/brute-force. Effort: M.
5. **#3 — Establish a database-level tenant-isolation backstop**
   (rewrite `enable-rls.sql` to the real `*_v2` tables + wire a NOBYPASSRLS app role +
   apply it + a two-tenant CI isolation test). App-level filtering holds today, so this is
   "must-fix-before-real-deploy" as a safety net rather than a live leak — but without it
   one future forgotten predicate is a silent cross-tenant breach with nothing to catch
   it. If RLS can't land before launch, the minimum bar is the CI isolation test +
   tenant-predicate lint so a regression fails loudly. Effort: L.
6. **#4 — Fix WCAG contrast on the Coral Sunset CTAs** (`app/globals.css`). The default
   button + active nav on every screen are unreadable (2.1-2.6:1); a token-lightness change
   only. Required if the deploy is user-facing/accessibility-bound. Effort: M.
7. **#5 — Give the hand-rolled drawers/modals dialog semantics + focus trap**
   (adopt the existing Radix `Dialog`/`Sheet`). Every CRUD and destructive-confirm flow is
   currently inoperable by keyboard/screen-reader users. Required if user-facing. Effort: L.

Strongly recommended in the same release (not strict blockers): **#7** (JWT
revocation is cosmetic until claims are re-validated), **#11** (401-vs-403 + guard
envelope), **#21** (member-role privilege escalation), **#16** (input labels), and
**#13** (unbounded list queries — the first scaling cliff a real tenant hits).

Everything else (the remaining perf, a11y polish, and code-rules items) is legitimate but
**deploy-deferrable** — schedule it, don't gate on it.
