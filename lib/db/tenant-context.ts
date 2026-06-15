import { sql } from "drizzle-orm";

import { db } from "./client";

/**
 * Tenant/RLS context (doc 19). The session (Auth.js, slice 2) resolves this and
 * passes it to every tenant-scoped query.
 */
export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string; // superadmin | tenant_owner | tenant_admin | member
}

/**
 * Run `fn` inside a transaction with the Postgres RLS context set, so
 * row-level-security policies (drizzle/rls/enable-rls.sql) filter by tenant.
 *
 * Uses `set_config(..., true)` (transaction-local, parameterized → injection-safe)
 * instead of raw `SET LOCAL`, which can't bind parameters. A `superadmin` role
 * bypasses tenant filtering per policy (doc 26).
 *
 * NOTE: RLS is not enabled on the tables yet (slice 1). This wrapper is the
 * forward-looking entry point; route handlers adopt it in slice 2 alongside the
 * RLS migration. Until then it's a harmless transaction wrapper.
 */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
    await tx.execute(sql`select set_config('app.user_id', ${ctx.userId}, true)`);
    await tx.execute(sql`select set_config('app.role', ${ctx.role}, true)`);
    return fn(tx);
  });
}
