# 06 — Module 1 Backend Design (REAL backend)

> **Sainskerta Loop Phase 03 — Foundation tick.** This is the engineering contract for the
> **real** (non-mock) Module-1 backend: identity/tenant, auth, onboarding+entitlements, branding,
> superadmin. It fixes the conventions every rebuild module follows, maps each M1 need to
> existing-vs-new code, and lists the API routes + service contracts.
>
> Source of truth for data: `01-data-model.md`; for entitlements/theming: `03-whitelabel-entitlements.md`;
> for IA: `05-product-flow.md`. This doc operationalizes them into code structure.

---

## 0. Scope of this tick

- **Conventions** (folder layout, db access, auth/rbac usage, API response shape, soft-delete pattern).
- **Schema for ALL M1 tables** as `modules/<domain>/schema.ts` + a `modules/index.ts` barrel, integrated
  into the existing Drizzle setup (`lib/db/client.ts`, `drizzle.config.ts`).
- **Reference domain `tenant` fully implemented**: `repo.ts` + `service.ts` + thin `app/api/tenant/*` routes
  (CRUD + soft-delete + restore + activate/suspend/quota).
- Other domains (`auth`, `onboarding`, `branding`, `superadmin`): **schema only** this tick; repo/service/routes land next.

Verification gates: `npx tsc --noEmit` and `npm run lint` (both green). `db:generate` is run to prove the
schema compiles into a migration; **`db:push`/`db:migrate`/`db:seed` are NOT run** — the live Neon DB is untouched.

---

## 1. Conventions (apply to every rebuild module)

### 1.1 Folder layout — modular monolith

```
modules/
  _shared/api.ts          ← {ok,error} envelope + ServiceError + handle() wrapper (cross-module)
  index.ts                ← re-exports every <domain>/schema.ts (one place for the db client + drizzle-kit)
  <domain>/
    schema.ts             ← Drizzle tables for the domain (owns its tables; no cross-module table reach-in)
    repo.ts               ← ONLY place that touches this domain's tables (typed reads/writes + soft-delete)
    service.ts            ← business logic, validation, cross-module side effects (audit), cascade
app/api/<domain>/
    route.ts              ← THIN: parse → call service → wrap with ok()/fail(). No DB here.
    [id]/route.ts         ← GET/PATCH/DELETE one resource
    [id]/restore/route.ts ← PATCH un-trash
    trashed/route.ts      ← GET soft-deleted rows
    [id]/<action>/route.ts← domain verbs (activate, suspend, quota, …)
```

Rule: **routes call services, services call repos, repos own tables.** A module never imports another
module's `schema.ts`/`repo.ts` directly for writes — it goes through the owning module's `service.ts`
(e.g. `tenant/service.ts` writes audit via `superadmin/repo.ts`'s public method, not by importing the table).

### 1.2 DB access — reuse the existing client + tenant context

- One Drizzle client: `import { db, hasDb } from "@/lib/db/client"`. The client now merges the legacy
  `lib/db/schema.ts` and the new `modules/**/schema.ts` (`{ ...legacySchema, ...moduleSchema }`) so both
  share a single pooled connection. `drizzle.config.ts` `schema` is now an array
  (`["./lib/db/schema.ts", "./modules/**/schema.ts"]`) so `db:generate` emits DDL for both.
- **Global tables** (`tenant`, `app_user`) → plain `db` (no tenant scoping).
- **Tenant-scoped tables** (`membership`, `usage_counter`, `tenant_entitlement_v2`, …) → wrapped in the
  existing `withTenant(ctx, tx => …)` (`lib/db/tenant-context.ts`) which sets the RLS/session config inside
  a transaction. We **reuse** `TenantContext` and `withTenant` verbatim — no new context system.
- `hasDb()` guards: a route returns an empty/`503` envelope when no Postgres credential is present, mirroring
  the existing prototype routes so the app still boots offline.

### 1.3 Auth + RBAC — reuse next-auth + the guard

- Sessions: **next-auth (JWT)** as-is (`lib/auth/auth.ts`, `lib/auth/session-context.ts`). `getTenantContext()`
  resolves `{tenantId,userId,role}` from the session. No change to the auth mechanism this tick.
- Authorization: `requirePermission(permission)` from `lib/rbac/guard.ts`. Superadmin routes use
  `platform.manage`; tenant routes use the relevant permission (`tenant.members.manage`, etc.). The guard
  returns `{ctx}` or a ready `NextResponse` error — rebuild routes convert that to the `{ok:false}` envelope.
- The `auth_session` / `password_reset` tables in `modules/auth/schema.ts` are the **persistent** records
  (revocable sessions, reset tokens) a stateless JWT can't hold; they augment next-auth, they don't replace it.

### 1.4 API response shape — one envelope

Every rebuild route returns:

```ts
{ ok: true,  data: T }                     // success
{ ok: false, error: string, code?: string } // failure (+ HTTP status)
```

Helpers in `modules/_shared/api.ts`:
- `ok(data, init?)` → `200`/custom; `fail(error, status, code?)` → error envelope with status.
- `ServiceError(message, status, code)` — services throw this; `handle(fn, tag)` wraps a route body so a
  `ServiceError` becomes a typed `fail()` and anything else becomes a logged `500` (no stack leak).

> Legacy prototype routes keep their ad-hoc `{ok, source}` shapes; **new** module routes use this envelope.

### 1.5 Soft-delete pattern (Rule: every entity)

- Every business table has `deleted_at timestamptz` (nullable). Pure append-only logs (`audit_log`,
  `password_reset`, `auth_session`) omit it and use a state column (`revoked_at`/`used_at`) instead.
- **Repo contract:** list/get reads filter `isNull(deletedAt)`. `softDelete(id)` sets `deleted_at=now()`;
  `restore(id)` clears it (and only matches rows where `deleted_at IS NOT NULL`). `listTrashed()` filters
  `isNotNull(deletedAt)`.
- **Route contract per resource:** `DELETE /…/[id]` (soft), `GET /…/trashed`, `PATCH /…/[id]/restore`.
- **Cascade** on delete (memberships/theme/entitlements when a tenant is removed) is **app-level in the
  service**, never a DB FK cascade (there are no FKs). Reverting per-row satellites (theme) = clear columns,
  not delete.

### 1.6 No foreign keys, snake_case, ids

- No `.references()` anywhere. Relations are plain `*_id text` soft refs; integrity enforced in services.
- SQL columns snake_case (Drizzle property camelCase). `id text primary key`, app-generated with an entity
  prefix (`tnt_`, `usr_`, `mbr_`, `usg_`, `aud_`). Tenant-scoped tables carry `tenant_id text not null` +
  a `*_tenant_idx`. TypeScript strict, `interface` over `type` for object shapes, double quotes, semicolons.

### 1.7 Non-collision with the legacy prototype (key decision)

The legacy `lib/db/schema.ts` already defines `tenants`/`users`/`memberships`/`invites`/`tenant_entitlement`/
`platform_setting`/`audit_log` with the OLD prototype shapes (plain-text password, no `slug`/`vertical_key`/
`activated_by`, no soft-delete on memberships, etc.). Two `pgTable` calls with the **same SQL name** in one
client would generate conflicting DDL.

**Decision:** the rebuild's M1 tables use **new SQL names** so they coexist without collision and without
touching the live DB this tick:

| Rebuild table (new SQL name) | Legacy table it supersedes |
|------------------------------|----------------------------|
| `app_user` | `users` |
| `tenant` | `tenants` |
| `membership` | `memberships` |
| `tenant_entitlement_v2` | `tenant_entitlement` |
| `audit_log_v2` | `audit_log` |
| `platform_setting_v2` | `platform_setting` |
| `user_theme` *(per-USER)* | *(none — new)* |
| `vertical`, `module_catalog`, `onboarding_state`, `usage_counter`, `auth_session`, `password_reset` | *(none — new)* |

Tradeoff considered: (a) **mutate the legacy tables in place** — minimal table count, but it rewrites the
running prototype's schema and risks breaking ~95 existing endpoints + the live Neon DB (forbidden this tick);
(b) **new-name parallel tables** (chosen) — clean greenfield surface, both worlds compile against one client,
the cutover/backfill is an explicit later migration. Given `db:push/migrate` are forbidden and the prototype
must keep running, (b) is the only safe path. The `_v2` suffix on the three platform tables that have a legacy
twin makes the supersession obvious; rebuild-only tables get clean singular names.

---

## 2. REUSE vs NEW — Module-1 need → code mapping

| M1 need | REUSE (existing) | NEW (this rebuild) |
|---------|------------------|--------------------|
| DB client / pooled connection | `lib/db/client.ts` `db`, `hasDb()` | merge module schema into the client |
| Tenant/RLS context | `lib/db/tenant-context.ts` `withTenant`, `TenantContext` | — |
| Soft-delete helpers (generic) | `lib/db/soft-delete.ts` (registry pattern) | per-repo `softDelete()/restore()/listTrashed()` |
| Sessions / login | `lib/auth/auth.ts`, `session-context.ts` (next-auth JWT) | `auth_session`, `password_reset` persistence tables |
| RBAC | `lib/rbac/guard.ts` `requirePermission`, `permissions.ts` roles | — (role values align: `tenant_owner`/`tenant_admin`/`sales_*`) |
| Entitlement semantics | `lib/entitlements.ts` (absent row = enabled) | `module_catalog`, `vertical`, `tenant_entitlement_v2`, `onboarding_state` tables |
| Migration tooling | `drizzle.config.ts` (.env.local loader) | `schema` becomes an array incl. `modules/**/schema.ts` |
| Audit trail | concept from `lib/compliance/audit.ts` | `audit_log_v2` + `superadmin/repo.ts` `insertAudit/recentAudit` |
| Activation status logic | concept from `lib/admin/kill-switch.ts` | `tenant/service.ts` `activate/suspend` + `tenant.status/active_until` |
| Tenant identity / users / memberships / quota | — | `modules/tenant/{schema,repo,service}` |
| Onboarding vertical → enabled modules | `lib/entitlements.ts` helpers (extend) | `modules/onboarding/schema.ts` (+ service next tick) |
| **Per-USER branding (full tokens + logo + favicon + custom CSS)** | shadcn token contract in `app/globals.css` | `modules/branding/schema.ts` `user_theme` |
| Superadmin activate/suspend/create | `requirePermission("platform.manage")` | `modules/tenant/service.ts` + `app/api/tenant/*` |

**Deliberate delta from docs 01/03:** those specced theming at **tenant** grain (`tenant_theme`). The M1 task
mandates **USER** grain. We follow the task: `user_theme` keyed by `user_id` (1:1 with user), full color-token
set + `logo_url`/`favicon_url`/`custom_css`, default Coral Sunset `#FD7A5C`. Entitlements/quota stay **tenant**
grain. (Recorded here so the model divergence is explicit; docs 01/03 to be reconciled in their next revision.)

---

## 3. Schema inventory (M1 tables created this tick)

| Domain | Table (SQL) | Grain | Soft-delete | PK / notable |
|--------|-------------|-------|-------------|--------------|
| tenant | `app_user` | global | yes | `email` unique; `password_hash`; `is_superadmin` |
| tenant | `tenant` | global | yes | `slug` unique; `status`; `active_until`; `activated_by/at`; `onboarding_completed_at` |
| tenant | `membership` | tenant | yes | uq `(tenant_id,user_id)`; `role`; `status` |
| tenant | `usage_counter` | tenant | no (rollup) | uq `(tenant_id,metric,period)`; `used`/`quota_limit` |
| auth | `auth_session` | (user) | no (`revoked_at`) | `user_id`, `active_tenant_id`, `expires_at` |
| auth | `password_reset` | (user) | no (`used_at`) | `token` unique, one-shot |
| onboarding | `vertical` | global catalog | yes | `key` unique; `default_modules` jsonb |
| onboarding | `module_catalog` | global catalog | yes | `module_key` unique; `is_core`; `sidebar_color` |
| onboarding | `tenant_entitlement_v2` | tenant | no (`enabled`) | uq `(tenant_id,module_key)`; `quota_overrides` jsonb |
| onboarding | `onboarding_state` | tenant | no (1:1) | `tenant_id` PK; `step`; `selected_modules` |
| branding | `user_theme` | **user** | no (satellite) | `user_id` PK; full tokens + logo/favicon + `custom_css` |
| superadmin | `platform_setting_v2` | global | no | `key` PK k/v |
| superadmin | `audit_log_v2` | tenant-aware | no (append-only) | `tenant_id` nullable; `action`; `target_type/id` |

All generated FK-free (verified: `db:generate` → `0 fks` per table).

---

## 4. API route list (M1)

`tenant` is implemented this tick; the rest are the planned contracts (same conventions).

### 4.1 tenant (IMPLEMENTED) — superadmin console (`platform.manage`)

| Method | Route | Service call | Purpose |
|--------|-------|--------------|---------|
| GET | `/api/tenant` | `tenantService.list()` | list active tenants |
| POST | `/api/tenant` | `create(input, actor)` | create tenant → `pending` |
| GET | `/api/tenant/trashed` | `listTrashed()` | soft-deleted tenants |
| GET | `/api/tenant/[id]` | `get(id)` | one tenant |
| PATCH | `/api/tenant/[id]` | `completeOnboarding(id)` | mark onboarding done (`{completeOnboarding:true}`) |
| DELETE | `/api/tenant/[id]` | `softDelete(id, actor)` | **soft** delete |
| PATCH | `/api/tenant/[id]/restore` | `restore(id, actor)` | un-trash |
| POST | `/api/tenant/[id]/activate` | `activate(id,{until,planKey},actor)` | activate w/ duration + plan |
| POST | `/api/tenant/[id]/suspend` | `suspend(id, actor)` | kill-switch |
| GET | `/api/tenant/[id]/quota` | `listQuota(targetCtx)` | quota counters |
| POST | `/api/tenant/[id]/quota` | `setQuota(targetCtx, metric, limit, period)` | set/override a quota ceiling |

> Coexists with the legacy `app/api/tenant/{status,members,onboarding,…}` static routes — Next.js resolves the
> static segments before the new `[id]` dynamic segment, so there is no routing conflict.

### 4.2 Planned (next ticks — same conventions)

- **auth:** `POST /api/auth/register` (create user+tenant pending, hash password), `POST /api/auth/password-reset`
  (+ `/confirm`), `GET /api/auth/sessions` + `DELETE /api/auth/sessions/[id]` (revoke). Login stays next-auth.
- **onboarding:** `GET/PATCH /api/onboarding` (state machine: vertical→branding→product→invite_team→done),
  `GET /api/onboarding/verticals` (catalog), `GET/POST /api/onboarding/entitlements` (resolve + toggle),
  `GET /api/onboarding/modules` (module_catalog).
- **branding:** `GET/PUT /api/branding/theme` (per-user upsert), `POST /api/branding/theme/reset`,
  `POST /api/branding/assets` (logo/favicon upload). Per-USER grain.
- **superadmin:** `GET /api/superadmin/overview`, `GET /api/superadmin/audit`, `GET/PUT /api/superadmin/settings`,
  `POST /api/superadmin/users` (create operator/owner). Tenant lifecycle reuses §4.1.

---

## 5. Service contracts (M1 domains)

### 5.1 `tenant/service.ts` (implemented)

```ts
list(): TenantRow[]
listTrashed(): TenantRow[]
get(id): TenantRow                                  // 404 ServiceError if missing/deleted
create({name,slug?,planKey?,verticalKey?}, actor?): TenantRow   // → pending; slug uniqueness (409)
activate(id, {until?,planKey?}, actor): TenantRow   // status=active, active_until, activated_by/at
suspend(id, actor): TenantRow                       // kill-switch
completeOnboarding(id): TenantRow
listQuota(ctx): UsageCounterRow[]
setQuota(ctx, metric, limit|null, period?, actor?): UsageCounterRow
checkQuota(ctx, metric, delta?, period?): { allowed, used, limit }   // action-level guard
softDelete(id, actor?): void                        // + app-level cascade hook (noted)
restore(id, actor?): TenantRow
```
Every mutation writes an `audit_log_v2` row via `platformRepo.insertAudit`.

### 5.2 Planned contracts

- **`auth/service.ts`:** `register(name,email,password)` (hash, create user+tenant pending+owner membership),
  `requestReset(email)`, `confirmReset(token,password)`, `listSessions(userId)`, `revokeSession(id)`.
- **`onboarding/service.ts`:** `getState(tenantId)`, `advance(tenantId, step, data)`,
  `resolveEntitlements(tenantId): {enabledModules, quotas, vertical}` (core ∪ (bundle ∩ cap) \ disabled),
  `setEntitlement(tenantId, moduleKey, enabled)`, `bundleForVertical(key)`.
- **`branding/service.ts`:** `getTheme(userId)` (row or Coral-Sunset defaults), `saveTheme(userId, patch)`,
  `resetTheme(userId)`, `resolveThemeVars(theme): Record<string,string>` (hex→HSL channels + derived
  `--primary-foreground`/`--primary-hover`/`--sidebar-active`), `sanitizeCustomCss(css)`.
- **`superadmin/service.ts`:** `overview()`, `recentAudit(tenantId|null)`, `getSetting/setSetting`,
  `createOperator(...)`. Tenant lifecycle delegates to `tenant/service.ts`.

---

## 6. Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (only pre-existing warnings in unrelated legacy files).
- `npm run db:generate` — emits `drizzle/migrations/0028_*.sql` with all 14 new tables, **0 FKs**; live DB untouched.
```
