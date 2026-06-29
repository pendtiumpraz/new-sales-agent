# Rebuild Audit — Multi-Tenant Data Isolation (Sainskerta Loop Phase 05)

Adversarial audit. Dimension: **multitenant**. Scope: `modules/**`, the new
`app/api/**` routes, `lib/auth/**`, `lib/db/{tenant-context,soft-delete,client}.ts`,
`lib/rbac/**`, `lib/ai/{meter,registry}.ts`, `middleware.ts`,
`scripts/apply-rebuild-migration.mts`, `drizzle/rls/**`.

Method: traced the trust chain session → `requirePermission` → `TenantContext` →
service → repo → `withTenant` + `eq(tenantId)`; then programmatically scanned every
repo for (a) `id`-only lookups missing a tenant predicate, (b) ref-column filters
missing a tenant predicate, (c) `tenantId` pinning order on inserts/updates, and
(d) RLS table-name coverage vs the actual rebuild table names.

## Severity counts

- CRITICAL: 1
- HIGH: 2
- MEDIUM: 3
- LOW: 4

---

## CRITICAL

### C1 — RLS is the documented isolation layer but is OFF *and* targets the wrong table names; app-level `eq(tenantId)` is the ONLY thing isolating tenants

- **Where:** `drizzle/rls/enable-rls.sql:18-41`, `lib/db/tenant-context.ts:24-37`,
  `scripts/apply-rebuild-migration.mts:35-48`, `drizzle/rls/README.md:1-12`.
- **Issue:** Two compounding failures:
  1. **Not applied.** `withTenant` (`tenant-context.ts:27`) sets `app.tenant_id` /
     `app.role` via `set_config(..., true)` for RLS, but the wrapper's own comment
     (`tenant-context.ts:24-25`) and `drizzle/rls/README.md:8-12` state RLS is
     deliberately deferred. The only DDL applier, `apply-rebuild-migration.mts`,
     *aborts* on any `ALTER TABLE` (`:35-40` `DESTRUCTIVE` regex includes
     `alter\s+table`) — so it structurally cannot run `enable-rls.sql` (which is all
     `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY`). `enable-rls.sql` is
     referenced nowhere except docs/comments. Net: **there is no DB-level tenant
     isolation today.**
  2. **Wrong tables even if applied.** The rebuild tables were renamed to avoid
     colliding with the legacy `lib/db/schema.ts` twins, so they are
     `company_v2`, `contact`, `pipeline`, `pipeline_stage`, `deal`, `activity`,
     `conversation_v2`, `message_v2`, `cadence_v2`, `cadence_step_v2`,
     `cadence_enrollment_v2`, `autopilot_run_v2`, `discovery_job`,
     `discovery_result`, `enrichment_record`, `marketplace_order`, `cart_recovery`,
     `marketplace_integration`, `marketplace_listing_v2`, `field_visit`,
     `field_check_in`, `retention_flow/step`, `content_template/plan`, `saved_report`,
     `knowledge_base`, `tenant_settings`, `wa_session_v2`, `wa_outbox_v2`,
     `conversation_stage`, `closing_readiness`, `market_fit`, `sales_play`,
     `tenant_entitlement_v2`, `usage_counter`, `membership`, `audit_log_v2`, etc.
     But `enable-rls.sql:21-29,46-69` enumerates **legacy** names: `kb`, `deals`,
     `contacts`, `conversations`, `messages`, `company`, `person`, `product`,
     `cadences`, `cadence_enrollments`, `memberships`, `audit_log`, … — **none of
     which are the rebuild tables.** So applying the file would (i) error on tables
     that don't exist and (ii) leave every rebuild table with zero RLS coverage.
- **Why it matters:** The whole "defense in depth" story collapses to a single layer.
  Tenant isolation now depends 100% on every present and future repo author
  remembering to add `eq(table.tenantId, ctx.tenantId)` to every WHERE. The current
  repos do this consistently (verified — see "What's correct"), but there is **no
  backstop**: one forgotten predicate in any future query = silent cross-tenant
  read/write, with nothing at the DB to catch it. The `app_user` RLS role
  (`create-app-role.sql`) is also not wired (`APP_POSTGRES_URL` unset → client falls
  back to the BYPASSRLS owner), so even a corrected `enable-rls.sql` would be bypassed.
- **Fix:** (1) Rewrite `enable-rls.sql` to the actual rebuild table names above
  (every table carrying `tenant_id`). (2) Add an `app_user` connection
  (`APP_POSTGRES_URL`, NOBYPASSRLS) and make `lib/db/client.ts` use it at runtime.
  (3) Apply RLS via a dedicated path (not the additive-only migration script —
  either relax the guard for the vetted RLS file or add a separate `apply-rls` script).
  (4) Add an isolation test (two tenants, one must not see the other; superadmin sees
  all) to CI so a missing predicate fails loudly. Until then, treat app-level
  filtering as the sole control and code-review every new repo query for it.

---

## HIGH

### H1 — Cross-tenant superadmin service methods have NO in-service `is_superadmin` guard; isolation rests entirely on the route layer

- **Where:** `modules/superadmin/service.ts:73-108` (`overview`, `listTenants`,
  `listUsers`, `recentAudit(null)`), `modules/superadmin/repo.ts:41-56`
  (`recentAudit`/`countAudit` with `tenantId: null` → unscoped `select … from
  audit_log_v2` across ALL tenants), `modules/tenant/repo.ts:31-37,122-137`
  (`listTenants`/`listUsers` global).
- **Issue:** These methods read every tenant's data with no `tenantId` scope by
  design (platform console). None of them check `is_superadmin`/role internally —
  they trust the caller. The matching routes DO guard
  (`app/api/admin/route.ts:16`, `admin/users/route.ts:13,29`,
  `admin/entitlements/route.ts:11,18` all `requirePermission("platform.manage")`,
  and `platform.manage` is granted only to the `superadmin` role —
  `lib/rbac/permissions.ts:33,59`). So today it's contained. But the invariant is
  "superadmin-only actions guarded by `is_superadmin`", and the *service* (the
  reusable unit) is unguarded: any future caller (a new route, an inngest job, a
  composed service) that invokes `superadminService.listUsers()` /
  `recentAudit(null)` without the route guard leaks all tenants. Defense-in-depth
  is absent at the layer that actually owns the cross-tenant query.
- **Fix:** Pass the caller's `TenantContext`/role into the cross-tenant superadmin
  methods and assert `ctx.role === "superadmin"` (or `is_superadmin`) at the top,
  mirroring how tenant-scoped services take `ctx`. Keep the route guard too.

### H2 — `superadminService.targetCtx` mints a `role:"superadmin"` context for arbitrary `tenantId`, giving an RLS bypass token that only the route gates

- **Where:** `modules/superadmin/service.ts:28-30` (`targetCtx(tenantId, op) =>
  { tenantId, userId, role: "superadmin" }`), used at `:192,238` and reachable from
  `app/api/admin/*`; `app/api/admin/route.ts:52-53,71` does
  `withTenant(ctx, tx => tx.update(tenantsTable)…where(eq(id, b.tenantId)))` where
  `b.tenantId` is **client-supplied** and `ctx.role` is `superadmin`.
- **Issue:** Once RLS is on (C1), the `app.role='superadmin'` predicate in every
  policy (`enable-rls.sql:37,52,60,67`) is a full cross-tenant bypass. `targetCtx`
  fabricates exactly that context for any `tenantId` the operator names. This is
  intended for provisioning/kill-switch, but it means the superadmin bypass is
  guarded ONLY by the route's `platform.manage` check — there is no second assertion
  that the *acting principal* is genuinely a superadmin before a superadmin-scoped
  `withTenant` runs. Combined with H1 (services don't self-guard), a single missing
  route guard anywhere that ends up calling a `targetCtx`-based flow = write into any
  tenant.
- **Fix:** Have `targetCtx` (and any superadmin-context factory) require proof the
  operator is a superadmin (look up `app_user.is_superadmin` for `operatorUserId`,
  or thread the verified caller role in and assert it). Do not synthesize a
  `superadmin` role from a bare `tenantId` argument.

---

## MEDIUM

### M1 — Soft-ref values (`workspace_id`, `product_id`) are written without tenant-existence validation; cross-tenant ids are accepted (no leak, but integrity hole + future-join risk)

- **Where:** `modules/crm/service.ts:300-301,591-592` (contact/deal write
  `workspaceId`/`productId` straight from input), contrasted with the validated refs
  `companyId`/`contactId`/`pipelineId`/`stageId` (`:295,578-581,642-648`).
- **Issue:** A caller can POST a deal/contact carrying *another tenant's*
  `workspaceId` or `productId`. Reads are tenant-scoped so the foreign id is inert
  today (filtering by it returns nothing), hence not a read leak. But it (a) corrupts
  referential integrity the service claims to enforce ("a contact's `workspace_id` …
  validated against live rows" — `service.ts:22-24`, which is only partly true), and
  (b) becomes a real leak the moment any code path joins/echoes the referenced row
  by id without re-scoping. The same gap exists in other modules that store
  `workspaceId`/`contactId` refs from input without an existence check.
- **Fix:** Validate `workspaceId` (via `workspaceRepo.get(ctx,…)`) and `productId`
  (via `productRepo`) the same way `companyId`/`contactId` are validated, in
  `createContact`/`updateContact`/`createDeal`/`updateDeal` and analogous services.

### M2 — Legacy WA gateway routes write tenant rows with raw `db.insert` (no `withTenant`) — will silently break or mis-scope once RLS lands

- **Where:** `app/api/wa/gateway/inbound/route.ts:48-80,94-99,104-109,121-125,178-186`
  (raw `db.insert(conversationsTable/messagesTable)` and selects, no `withTenant`),
  `app/api/wa/gateway/outbox/route.ts` (via `lib/wa/store`).
- **Issue:** These resolve the tenant correctly and *server-side* via
  `ownerOfSession(sessionId)` (`:39`) — tenant is NOT taken from client input, so
  there's no cross-tenant write today (good). They are authed by a shared
  `WA_GATEWAY_TOKEN` (`:24`). But they bypass `withTenant` entirely, so they never
  set `app.tenant_id`. Under the RLS role intended in C1, every insert/select here
  would be filtered to "no tenant" and fail. They also write the *legacy*
  `conversations`/`messages` tables, not the rebuild `conversation_v2`/`message_v2`,
  so they sit half-in/half-out of the rebuild. Flagged as MEDIUM because it's
  isolation-relevant plumbing the rebuild must reconcile, not an active leak.
- **Fix:** When migrating WA onto the rebuild `wa`/`inbox` modules, route these
  writes through the repos (`withTenant`) using the `ownerOfSession`-resolved
  `TenantContext`. Until then, document them as legacy and excluded from RLS.

### M3 — `ai_usage` / AI-credential tables the meter+registry use are legacy-schema tables NOT covered by the (broken) RLS list, and the registry's own comment claims RLS is the belt to its suspenders

- **Where:** `lib/ai/meter.ts:4,85-97,156-168` (`insert aiUsageTable`),
  `lib/ai/registry.ts:1-11,30-52` ("Explicit tenant_id filters belt-and-suspender
  RLS" — `:26-28`).
- **Issue:** The registry resolves a tenant's AI credential and active model scoped
  by `eq(tenantId, ctx.tenantId)` (`registry.ts:35,48`) and the meter writes
  `ai_usage` scoped to `ctx.tenantId` (`meter.ts:89`) — app-level scoping is correct.
  But the comment explicitly leans on RLS as the second layer, and (per C1) that
  layer does not exist: `ai_usage`/`ai_credential`/`tenant_active_model` are legacy
  tables and the RLS file (even if applied) lists `ai_usage`/`ai_credential`/
  `tenant_active_model` but is never run. An API-key (BYOK secret) cross-tenant read
  would therefore have no DB backstop — the single `eq(tenantId)` on the credential
  select (`registry.ts:48`) is all that prevents one tenant decrypting another's key.
- **Fix:** Same as C1 (enable RLS on these tables with a NOBYPASSRLS role). Keep the
  explicit `tenantId` filters; do not relax them on the assumption RLS covers them.

---

## LOW

### L1 — Superadmin gate is role-derived, not a direct `is_superadmin` check

- **Where:** `lib/rbac/guard.ts:17-26`, `lib/auth/auth.ts:25-37,65`,
  `lib/rbac/permissions.ts:33`.
- **Issue:** Admin routes check `platform.manage`, which maps from the `superadmin`
  Role, which is set only when `user.isSuperadmin` is true (`auth.ts:65`
  `membershipRole(role, user.isSuperadmin)`). Functionally equivalent to an
  `is_superadmin` check, but it's an indirection: the `session.user.role` string is
  the source of truth, and the offline demo path can mint `isSuperadmin: true` from
  `account.role === "Superadmin"` (`auth.ts:84`). Acceptable for the prototype; note
  it because the invariant says "guarded by `is_superadmin`" specifically.
- **Fix:** For superadmin-only routes, additionally assert
  `session.user.isSuperadmin === true` (it's on the token) rather than only the
  derived role.

### L2 — `withTenant` sets RLS context every call but provides zero isolation while RLS is off — easy to mistake for protection

- **Where:** `lib/db/tenant-context.ts:27-37`.
- **Issue:** The wrapper looks like it enforces tenancy (it opens a transaction and
  `set_config`s `app.tenant_id/user_id/role`). With RLS disabled (C1) it is, per its
  own comment (`:24-25`), "a harmless transaction wrapper." A reader could wrongly
  assume a query inside `withTenant` is automatically tenant-safe even without an
  `eq(tenantId)` predicate. (No current repo relies on that — all add the predicate —
  but the foot-gun is real.)
- **Fix:** Until RLS is live, add a dev-only assertion/lint that every
  `tx.select/update/delete` inside a `withTenant` on a tenant-scoped table includes a
  `tenant_id` predicate, or document loudly that `withTenant` is currently inert.

### L3 — `branding` user_theme grain (per-USER, global, no tenant_id) is correct but unguarded against cross-user reads at the repo level

- **Where:** `modules/branding/repo.ts:18-62`, `modules/branding/schema.ts:14-45`.
- **Issue:** Per the invariant, branding is per-USER and entitlements are per-TENANT —
  the grain is respected (`user_theme` keyed by `user_id`, no `tenant_id`;
  `tenant_entitlement_v2` is tenant-scoped via `withTenant` in
  `onboarding/repo.ts:162-220`). Correct. But `brandingRepo.getByUserId(userId)` /
  `clear(userId)` take a raw `userId` with no enforcement that it equals the session
  user — isolation depends entirely on the route passing `session.user.id`. A route
  bug passing a client-supplied `userId` would read/reset another user's theme
  (low-impact data: colors/logo, but still cross-user).
- **Fix:** Resolve `userId` from the session inside the branding service/route only;
  never accept it from the request body. (Verify `app/api/branding/theme/route.ts`
  does this.)

### L4 — Audit rows accept `tenantId: null` and the audit table is on the broken RLS list; cross-tenant audit reads guarded only by route

- **Where:** `modules/superadmin/repo.ts:22-39` (`insertAudit` allows null tenant),
  `:41-49` (`recentAudit(null)` reads all), `enable-rls.sql:63-69` (lists `audit_log`,
  not `audit_log_v2`).
- **Issue:** Platform-level audit rows legitimately have `tenant_id = null`
  (`insertAudit` default), and `recentAudit(null)` reads across tenants for the
  console. The RLS policy that would scope tenant-attributed audit rows targets the
  legacy `audit_log` name, not `audit_log_v2`, so audit isolation has no DB backstop
  either. Same root cause as C1/H1; called out separately because audit data often
  contains other tenants' identifiers in `meta`.
- **Fix:** Include `audit_log_v2` in the corrected RLS list (with a policy allowing
  `tenant_id IS NULL` rows to be superadmin-only), and guard `recentAudit(null)` per
  H1.

---

## What's correct (so the report is calibrated, not just alarmist)

- **Every rebuild repo that owns a tenant-scoped table wraps reads/writes in
  `withTenant` and conjoins `eq(table.tenantId, ctx.tenantId)`.** Programmatic scan
  found **zero** `id`-only or ref-column (`conversationId`/`jobId`/`contactId`/
  `companyId`/`workspaceId`) lookups on a tenant table missing a tenant predicate.
  The only `id`-only / `userId`-only lookups are on legitimately GLOBAL tables
  (`tenant`, `app_user`, `auth_session`, `user_theme`, `vertical`, `module_catalog`,
  `password_reset`) and the documented login-time `firstMembershipForUser`
  (`tenant/repo.ts:210-218`).
- **`tenant_id` is pinned correctly on every insert/update**: the pattern is
  invariably `{ ...values, tenantId: ctx.tenantId }` and `set({ ...patch, tenantId:
  ctx.tenantId, … })` — the spread is always BEFORE the pin, so a malicious payload
  cannot override the tenant. (CRM/inbox/outreach/sales/workspace/etc. all verified.)
- **`TenantContext` is never taken from client input.** It is built solely by
  `getTenantContext()` from the Auth.js session (`lib/auth/session-context.ts:9-14`)
  and handed to routes via `requirePermission` (`lib/rbac/guard.ts:17-26`). Routes
  pass `g.ctx` to services; `params.id` / query filters are scoped *within* that ctx.
- **CRM enforces cross-tenant referential integrity in-app** for the validated refs:
  `getCompany/getContact/getPipeline/assertStageInPipeline/assertSubjectExists` all
  run tenant-scoped before a ref is written (`crm/service.ts:295,493,578-581,712`).
- **Child/satellite reads are doubly scoped** (tenant + parent id): messages by
  conversation (`inbox/repo.ts:236-248`), enrichment results by job
  (`enrichment/repo.ts:168-170,221-222`), records by contact (`:353-354,408-409`),
  market_fit/sales_play by workspace (`workspace/repo.ts:154-292`).
- **API response envelope** (`{ok,data}|{ok,error}`) is centralized in
  `modules/_shared/api.ts` and used by the rebuild routes; no stack leaks to client
  (`handle()` → 500 "Internal error").
- **AI flows go through `lib/ai/meter`** (`meteredGenerateText`/`meteredStreamText`),
  which resolves the model/key tenant-scoped via `registry.resolveActiveModel(ctx)`
  and records `ai_usage` under `ctx.tenantId`.
