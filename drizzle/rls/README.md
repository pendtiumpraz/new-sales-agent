# Row-Level Security (RLS) — rollout

`enable-rls.sql` enforces tenant isolation at the **database** layer (doc 19,
AUDIT #3). It is the backstop under the app-level `eq(tenantId)` filtering every
repo already does: if one future query forgets its tenant predicate, RLS still
stops the cross-tenant leak.

It targets the **rebuild** module tables — every table with a `tenant_id` column
across `modules/**/schema.ts` (`company_v2`, `contact`, `conversation_v2`,
`message_v2`, `deal`, `membership`, `audit_log_v2`, … the full list is in the
file). It is **deliberately NOT part of the auto-run drizzle migrations**.

## Why it's separate

Enabling RLS makes every tenant-scoped table return **zero rows** unless the
connection has set `app.tenant_id` (via `withTenant()` in
`lib/db/tenant-context.ts`). Apply it only after the route handlers wrap their
queries in `withTenant` (they do, in the rebuild).

## Prerequisites

- The rebuild tables exist in the DB (apply the generated migration via
  `scripts/apply-rebuild-migration.mts` first if they don't).
- Every tenant-scoped route reads/writes inside `withTenant(ctx, …)`.

## Apply steps (operator runs these, in order)

> Run from the repo root. `$OWNER_URL` = `POSTGRES_URL_NON_POOLING` (the
> `neondb_owner` direct endpoint). Both SQL files (`create-app-role.sql`,
> `enable-rls.sql`) are applied with `psql` (or pasted into the Neon SQL editor)
> — **never** through `scripts/apply-rebuild-migration.mts`, whose additive-only
> guard ABORTS on the `ALTER TABLE`/`CREATE POLICY` statements these files are
> made of. The dedicated apply path is plain `psql -f`.

1. **Create the NOBYPASSRLS app role.** Edit `create-app-role.sql` and replace
   `<STRONG_PASSWORD>`, then run it as the owner:

   ```sh
   psql "$OWNER_URL" -f drizzle/rls/create-app-role.sql
   ```

   This creates `app_user` (defaults to NOBYPASSRLS), `GRANT`s it
   SELECT/INSERT/UPDATE/DELETE on all current + future tables, and verifies
   `rolbypassrls = false`. `neondb_owner` (BYPASSRLS) stays the owner for
   migrations / drizzle-kit / studio.

2. **Apply the RLS policies** (as the owner — owner can always ALTER its tables):

   ```sh
   psql "$OWNER_URL" -f drizzle/rls/enable-rls.sql
   ```

   `enable-rls.sql` is idempotent (`ENABLE`/`FORCE` are no-ops if already set;
   each policy is `DROP POLICY IF EXISTS` then re-`CREATE`d), so it is safe to
   re-run after adding new tenant tables.

3. **Wire the app to the NOBYPASSRLS role.** Add `app_user`'s connection strings
   to `.env.local` (get them from Neon → Roles → `app_user`):

   ```sh
   APP_POSTGRES_URL=postgresql://app_user:…@…-pooler.…/neondb?sslmode=require
   APP_POSTGRES_URL_NON_POOLING=postgresql://app_user:…@….…/neondb?sslmode=require
   ```

   `lib/db/client.ts` prefers `APP_POSTGRES_URL` for runtime queries; without it
   the app falls back to the **owner** URL, which BYPASSES RLS (DB-level
   isolation OFF — only app-level filtering applies). `usingRlsRole()` reports
   which path is live.

4. **Verify isolation with the two-tenant test:**

   ```sh
   npx tsx scripts/test-tenant-isolation.mts
   ```

   It seeds a company in two tenants (as the owner), then connects **as
   `app_user`** and asserts: tenant A reads its own row but not B's (and
   symmetrically), an unset context sees nothing (fail-closed), a tenant cannot
   `INSERT` a row stamped with another tenant (WITH CHECK), and a `superadmin`
   context sees both. Exit 0 = isolation holds; non-zero = a leak → fail CI. It
   refuses to run if `APP_POSTGRES_URL` is unset or equals the owner URL (RLS
   would be bypassed and the test would prove nothing). Fixtures are cleaned up.

## Notes

- **FORCE ROW LEVEL SECURITY** is required because the owner connection bypasses
  RLS otherwise; FORCE makes policies apply to the owner too (belt-and-suspenders
  — the app still connects as the NOBYPASSRLS `app_user` at runtime).
- **Superadmin bypass is a policy predicate** (`app.role = 'superadmin'`), not a
  DB superuser — auditable (doc 26).
- **`membership`** policy also allows `user_id = app.user_id` so login can resolve
  a user's tenants before a tenant is chosen.
- **`audit_log_v2`** has a NULLABLE `tenant_id` for platform events: tenant rows
  follow the standard pin; `tenant_id IS NULL` rows are superadmin-only (AUDIT
  #29/#41).
- **AI meter/registry** (#27): the tenant-scoped half of the AI catalog —
  `ai_credential`, `tenant_active_model`, `ai_usage` — IS RLS'd (standard tenant
  pin). Their global siblings `ai_provider` / `ai_model` are a superadmin-managed
  catalog with no `tenant_id`, so they are app-gated, not RLS'd.
- **Not RLS'd** (no `tenant_id`): `app_user`, `tenant`, `platform_setting_v2`,
  `vertical`, `module_catalog`, `ai_provider`, `ai_model` (global, gated at the
  app layer via the RLS'd `membership` table) and `auth_session` /
  `password_reset` / `user_theme` (user-scoped, resolved by `user_id` before a
  tenant context exists).
