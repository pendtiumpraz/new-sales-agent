# Rebuild Audit — Dimension: code-rules

Adversarial audit of the Agentic Sales AI rebuild (Sainskerta Loop Phase 05).
Scope: `modules/**`, rebuild `app/api/**` routes (those importing `@/modules`),
`lib/auth/**`, `middleware.ts`, `scripts/apply-rebuild-migration.mts`.
Dimension focus: code quality + rule adherence (foreign keys, snake_case,
soft-delete/restore/hardDelete, mock/hardcoded data, `{ ok }` envelope, dead
code / TODO / unhandled promise / any-casts, route error handling).

Date: 2026-06-29. Auditor stance: skeptical, cite `file:line`.

---

## Summary — counts by severity

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH     | 2 |
| MEDIUM   | 3 |
| LOW      | 4 |

Overall the rebuild is **unusually disciplined** on the mechanical rules: no
`.references()`/foreign keys anywhere in `modules/*/schema.ts`; snake_case SQL
identifiers are 100% clean; the `{ ok, data } | { ok, error }` envelope is used
by **every** rebuild route (0 raw `NextResponse.json`); every route wraps its
body in `handle()`; repos uniformly filter `eq(table.tenantId, ctx.tenantId)`
AND `deleted_at IS NULL`; `tsc --noEmit` is **0 errors** project-wide; no
`as any` / `@ts-ignore` / TODO / `console.log` / empty `catch {}` in `modules/`.
The findings below are the exceptions — concentrated in the auth fallback path,
the RLS/`withTenant` gap, and a few systematic error-handling inconsistencies.

---

## CRITICAL

### C1 — Hardcoded demo accounts (incl. a plaintext SUPERADMIN credential) are wired into the REAL auth flow
- **Severity:** CRITICAL
- **File:** `lib/auth/auth.ts:75-89` (fallback), `lib/auth/demo-accounts.ts:18-58` (data), `lib/auth/demo-accounts.ts:61,70-72` (compare)
- **Issue:** The Auth.js `authorize` callback's step 2 falls back to
  `findAccount(email, password)` against the hardcoded `DEMO_ACCOUNTS` array.
  These are **mock/hardcoded data with real auth consequences**, directly
  violating the "NO mock/hardcoded data" + "secrets server-only" invariants:
  - `superadmin@mairasales.com / super1234` (plaintext) authorizes with
    `isSuperadmin: true` + `role: "superadmin"` + `tenantStatus: "active"`,
    granting the `platform.manage` permission across the **entire platform**
    (every cross-tenant superadmin route trusts exactly this).
  - The credential check is a non-constant-time string compare
    (`a.password === password`, `demo-accounts.ts:71`) — plaintext passwords
    live in source.
  - `DEFAULT_DEMO_ACCOUNT = DEMO_ACCOUNTS[0]` (`demo-accounts.ts:61`) is the
    Superadmin, used by "open the demo without logging in" flows.
  - The fallback fires whenever `hasDb()` is true but the real
    `verifyCredentials` returns null (wrong password) — i.e. it is reachable in
    a DB-backed deployment, not just offline.
- **Fix:** Gate the demo fallback behind an explicit non-production flag (e.g.
  `if (process.env.ALLOW_DEMO_AUTH === "1" && !isProd)`), or drop it from
  `auth.ts` entirely and seed the demo users as real `app_user` rows with
  scrypt hashes via `db:seed`. At minimum, never ship a hardcoded
  `isSuperadmin: true` credential; move `DEMO_ACCOUNTS` out of the bundled auth
  path so it cannot be the live authorization source.

---

## HIGH

### H1 — `withTenant` provides NO tenant isolation for rebuild tables (RLS targets legacy table names only)
- **Severity:** HIGH
- **File:** `lib/db/tenant-context.ts:23-26` (wrapper is a no-op until RLS),
  `drizzle/rls/enable-rls.sql:21-40,46` (table list)
- **Issue:** `withTenant` sets `app.tenant_id/user_id/role` then runs `fn` in a
  transaction, but the comment is explicit: *"RLS is not enabled on the tables
  yet … Until then it's a harmless transaction wrapper."* Crucially,
  `enable-rls.sql` enumerates **legacy** table names (`kb`, `deals`, `contacts`,
  `company`, `person`, `memberships`, `invites`, `audit_log`, …) — NOT the
  rebuild tables (`tenant`, `app_user`, `membership`, `usage_counter`,
  `company_v2`, the `*_v2` outreach tables, `knowledge_base`, etc.). So even if
  that migration is applied, **rebuild tables get zero database-enforced
  isolation**. Tenant safety rests **entirely** on every repo remembering the
  explicit `eq(table.tenantId, ctx.tenantId)` filter.
- **Why not CRITICAL:** I audited the repo layer — isolation currently holds.
  Spot-checked `crm` (`modules/crm/repo.ts:44,66,94,111` etc.),
  `enrichment` (`repo.ts:168,203,221`), and `inbox` (`repo.ts:192,242` — note
  child reads filter `tenantId` *before* `conversationId`, so a cross-tenant
  `conversationId` returns nothing). The defense is real but is a single layer
  with no DB backstop: one forgotten `tenantId` clause = silent cross-tenant
  leak with nothing to catch it.
- **Fix:** Author a rebuild RLS migration that `ENABLE/FORCE ROW LEVEL SECURITY`
  + `tenant_isolation` policy on the actual rebuild table names, and apply it
  via `apply-rebuild-migration.mts`. Until then, treat `withTenant` as
  documentation only and add a repo-level lint/test asserting every
  tenant-scoped query references `tenantId`.

### H2 — Auth/permission failures collapse 401 (no session) into 403 "Forbidden" across all ~339 route handlers
- **Severity:** HIGH (correctness + envelope-shape consistency; mass-scale)
- **File:** `lib/rbac/guard.ts:19-25`; pattern in every rebuild route, e.g.
  `app/api/companies/route.ts:11,21`, `app/api/contacts/[id]/route.ts:16,25,40`
- **Issue:** `requirePermission` correctly distinguishes the two cases —
  returns `401 {error:"Unauthorized"}` for no session, `403 {error:"Forbidden"}`
  for wrong role. But **every** route discards that and does
  `if ("error" in g) return fail("Forbidden", 403, "forbidden")` (339
  handlers). Net effects:
  1. An **unauthenticated** caller always gets `403`, never `401` — clients
     can't tell "log in" from "you can't do this", and middleware-less `/api`
     (see L3) means this is the only signal.
  2. The guard's own `g.error` body is `{ error }` (NOT the
     `{ ok:false, error }` envelope), so the rebuild only stays
     envelope-consistent **because** routes throw `g.error` away and call
     `fail()`. The intended `return g.error` usage in the guard's own docstring
     (`guard.ts:13`) would break the invariant — a trap for the next route
     author.
- **Fix:** Either return `g.error` after reshaping the guard to emit the
  `{ ok:false, error }` envelope with the correct 401/403 status, or have the
  route forward the guard's status: `if ("error" in g) return g.error;` once the
  guard is envelope-conformant. Centralize so a future route can't silently
  regress the envelope.

---

## MEDIUM

### M1 — 94 rebuild routes call `await req.json()` unguarded → malformed body returns 500 "Internal error" instead of 400
- **Severity:** MEDIUM (error handling; 94 routes)
- **File:** e.g. `app/api/companies/route.ts:18`, `app/api/contacts/[id]/route.ts:24`,
  `app/api/superadmin/users/route.ts:24`, `app/api/tenant/[id]/quota/route.ts:38`
- **Issue:** `handle()` (`modules/_shared/api.ts:46-59`) only special-cases
  `ServiceError`; anything else (including a `SyntaxError` from `req.json()` on a
  malformed/empty body) becomes `fail("Internal error", 500, "internal")`. So
  bad client input is reported as a server fault. 94 rebuild handlers use bare
  `await req.json()`; only 18 guard it with `.catch(() => ({}))` (e.g.
  `app/api/auth/register/route.ts:16` does it right). Inconsistent + wrong
  status class.
- **Fix:** Add a `parseJson(req)` helper in `_shared/api.ts` that catches the
  parse error and throws `new ServiceError("Body tidak valid", 400, "bad_json")`,
  and use it everywhere instead of raw `await req.json()`.

### M2 — Onboarding global catalogs expose softDelete + restore but NO hardDelete/purge (and no trashed listing)
- **Severity:** MEDIUM (soft-delete contract incomplete per the invariant)
- **File:** `modules/onboarding/repo.ts:85-99,143-157` (only soft/restore),
  `app/api/onboarding/verticals/[id]/route.ts:25-32`,
  `app/api/onboarding/modules/[id]/route.ts:25-32`
- **Issue:** The invariant says each resource exposes
  `softDelete/restore/hardDelete`. `vertical` and `module_catalog` implement
  soft-delete + restore but have **no `hardDelete*` repo method and no purge
  route** — there is no way to permanently remove a trashed catalog row, and no
  `trashed` listing route for them either. (By contrast `settings/kb`,
  `sales/techniques`, and all CRM/outreach resources correctly expose purge via
  `DELETE ?purge=1`.) The repo comment (`onboarding/repo.ts:30`) rationalizes
  this as "catalog/inventory … no trashed/restore" — yet restore *is* exposed,
  so the contract is half-applied and self-inconsistent.
- **Fix:** Add `hardDeleteVertical`/`hardDeleteModule` to the repo + a
  `?purge=1` branch on the `[id]` routes (guarded by `platform.manage`, matching
  the existing soft-delete guard), plus `trashed` list routes for parity — or
  consciously document these two as restore-only and drop the `restore` routes
  to stop being half-and-half.

### M3 — `audit_log_v2` cross-tenant reads run on unscoped `db` with a nullable filter; safety depends solely on caller gating
- **Severity:** MEDIUM (defense-in-depth gap)
- **File:** `modules/superadmin/repo.ts:41-54` (`recentAudit`/`countAudit` with
  `tenantId ? eq(...) : undefined`)
- **Issue:** `recentAudit(null)` / `countAudit(null)` query the audit log with
  **no `where`** on plain global `db` (correct for the superadmin console). But
  there is no in-repo/in-service assertion that the caller is a superadmin — the
  ONLY thing preventing a tenant-scoped caller from passing `null` and reading
  every tenant's audit trail is the route guard (`platform.manage`,
  `app/api/superadmin/audit/route.ts:11`). Combined with H1 (RLS doesn't cover
  `audit_log_v2`) this is a single-layer control over a cross-tenant data path.
  Also note `audit_log_v2` has no soft-delete — acceptable (append-only by
  design, per `superadmin/repo.ts` comment), flagged only so the soft-delete
  exception is explicit.
- **Fix:** Have the service require an explicit superadmin context (e.g.
  `assertSuperadmin(ctx)`) before issuing an unscoped audit read, so the
  "give me everyone's audit" path can't be reached without the role even if a
  future route forgets the guard.

---

## LOW

### L1 — `targetCtx` forges a `role: "superadmin"` TenantContext from a URL path param
- **Severity:** LOW (currently safe; brittle pattern)
- **File:** `app/api/tenant/[id]/quota/route.ts:16-18,26,40`
- **Issue:** The route builds `{ tenantId: params.id, userId, role: "superadmin" }`
  straight from the URL. It's gated by `platform.manage` so it's fine today, and
  if RLS lands the `role:"superadmin"` is the intended cross-tenant escape
  hatch. But the pattern (synthesize an elevated context from request input) is
  exactly the shape that becomes an escalation if copied into a route with a
  weaker guard. No other route does this.
- **Fix:** Centralize as a `superadminTargetCtx(targetTenantId, operator)` helper
  that itself re-asserts `operator.isSuperadmin`, so the elevation can't be
  reproduced ad hoc with the wrong guard.

### L2 — Demo path pins users to a hardcoded `tenantId: "t_default"` that may not exist as a real tenant row
- **Severity:** LOW (latent inconsistency)
- **File:** `lib/auth/auth.ts:18,82`
- **Issue:** `DEFAULT_TENANT_ID = "t_default"`; the demo fallback issues a JWT
  with `tenantId: "t_default"`. If that tenant row doesn't exist in the rebuild
  `tenant` table, every `withTenant`/`eq(tenantId,"t_default")` repo read returns
  empty and writes attach to a phantom tenant — a confusing "logged in but
  everything is empty" state. Tied to C1 (remove the demo path and this
  evaporates).
- **Fix:** If the demo path survives (see C1), seed a real `t_default` tenant +
  membership; otherwise remove the constant.

### L3 — Middleware treats the entire `/api/*` namespace as public; all API auth rests on per-route discipline
- **Severity:** LOW (acceptable given current state, fragile)
- **File:** `middleware.ts:15-16,18-25`
- **Issue:** `pathname.startsWith("/api")` ⇒ `isPublic`, so no edge gate on any
  API route. Comment: "API routes handle their own auth." Verified true for the
  rebuild (every `@/modules` route calls `requirePermission`), but it means a
  single forgotten guard = a fully exposed endpoint with nothing upstream to
  catch it, and legacy/non-rebuild routes in the same namespace get no
  protection either.
- **Fix:** Keep public auth/registration/webhook prefixes explicit and default
  the rest of `/api` to authenticated at the middleware, OR add a CI check that
  every `app/api/**/route.ts` exporting a mutating method imports a guard.

### L4 — `apply-rebuild-migration.mts` destructive-DDL guard is regex-based and can be evaded by formatting
- **Severity:** LOW (safety guard, not runtime)
- **File:** `scripts/apply-rebuild-migration.mts:38,40-43`
- **Issue:** The additive-only guard greps each statement for
  `\b(drop\s+table|drop\s+column|alter\s+table|alter\s+column|truncate)\b`.
  `\s+` only matches whitespace, so newline/comment-interrupted DDL
  (`ALTER/*x*/TABLE`, or `DROP\n\tTABLE` is fine but `DROP  TABLE` with a comment
  token between keywords) can slip past; conversely it also blocks legitimate
  additive `ALTER TABLE ... ADD COLUMN` (intentional fail-safe). It runs all
  statements in one transaction (good — atomic, `:46-52`), and rolls back on
  error (`:64-66`). Low risk because it's a dev-run tool with human review, but
  the guard is a string heuristic, not a SQL parse.
- **Fix:** Normalize whitespace/strip comments before matching, or parse the DDL.
  Acceptable as-is for a guarded manual tool; documenting the limitation.

---

## Verified-clean (explicitly checked, no finding)

- **Foreign keys:** `grep` for `.references(`/`foreignKey`/`references:` across
  `modules/**` → **0 hits**. Schemas document `*_id` as plain text soft refs
  (e.g. `modules/tenant/schema.ts:17-18`). PASS.
- **snake_case:** no camelCase SQL identifiers in any `pgTable(...)` / column
  string. PASS.
- **`{ ok }` envelope:** 0 raw `NextResponse.json`/`Response.json` in rebuild
  routes; all via `ok()`/`fail()` (`modules/_shared/api.ts`). PASS.
- **Error wrapping:** every rebuild route body runs inside `handle()` (0
  exceptions found). PASS (caveat M1/H2 on status precision).
- **AI via meter only:** no `modules/**` file imports `lib/ai/provider` or
  `deepseek` directly; `modules/sales/service.ts:2,208` and
  `modules/settings/service.ts` use `meteredGenerateText` exclusively. PASS.
- **Layering:** 0 direct `db.(select|insert|update|delete)` in any
  `modules/*/service.ts`; all DB access is in repos. PASS.
- **Soft-delete reads:** spot-checked repos filter `deleted_at IS NULL` on
  list/get and `IS NOT NULL` on `*Trashed`. PASS (except M2 onboarding).
- **Password handling:** `modules/auth/password.ts` — scrypt + per-row salt +
  cost, constant-time `timingSafeEqual`, never stores plaintext. PASS.
- **superadmin gating:** `platform.manage` ⇒ only the `superadmin` role
  (`lib/rbac/permissions.ts:38`), and that role is assigned **only** when
  `user.isSuperadmin` (`lib/auth/auth.ts membershipRole`). Creating a superadmin
  is gated by `platform.manage` (`app/api/superadmin/users/route.ts:20-25`).
  PASS (caveat C1's hardcoded superadmin bypasses the DB check).
- **Hidden bugs:** `tsc --noEmit` = **0 errors** project-wide; no `as any`,
  `@ts-ignore`, `@ts-expect-error`, TODO/FIXME/HACK, `console.log`, or empty
  `catch {}` in `modules/`; no floating audit promises (all `await`ed). PASS.
- **Mock data in routes:** only no-db fallbacks return empty shapes
  (`ok([])` / `app/api/sales/techniques/recommend/route.ts:16` returns
  `{ techniques: [] }`); no hardcoded fixtures served as live data. PASS.
