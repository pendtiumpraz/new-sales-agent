# Row-Level Security (RLS) — rollout

`enable-rls.sql` enforces tenant isolation at the database layer (doc 19). It is
**deliberately NOT part of the auto-run drizzle migrations** in `drizzle/migrations/`.

## Why it's separate

Enabling RLS makes every tenant-scoped table return **zero rows** unless the
connection has set `app.tenant_id` (via `withTenant()` in
`lib/db/tenant-context.ts`). Today's `app/api/db/*` route handlers query without
that context, so applying RLS now would break the running app.

## Slice 2 rollout order

1. Ship Auth.js (doc 28) so a session resolves `{ tenantId, userId, role }`.
2. Backfill: create a default tenant, set `tenant_id` on existing rows, then
   `ALTER TABLE ... ALTER COLUMN tenant_id SET NOT NULL` for tenant-scoped tables.
3. Refactor `app/api/db/*` handlers to wrap queries in `withTenant(ctx, tx => …)`.
4. Apply this file once: `psql "$POSTGRES_URL_NON_POOLING" -f drizzle/rls/enable-rls.sql`
   (or via `db:studio` / a one-off script).
5. Verify isolation: two tenants must not see each other's rows; superadmin
   context (`app.role = 'superadmin'`) sees all.

## Notes

- `FORCE ROW LEVEL SECURITY` is required because the app connects as the table
  owner, which bypasses RLS otherwise.
- Superadmin bypass is a **policy predicate**, not a DB superuser — auditable.
- `memberships` policy also allows `user_id = app.user_id` so login can resolve a
  user's tenants before a tenant is chosen.
