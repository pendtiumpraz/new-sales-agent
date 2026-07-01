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
  /**
   * Platform-staff flag from `app_user.is_superadmin`, re-resolved per request
   * (audit #7) and asserted directly on superadmin-only routes (audit #39) rather
   * than trusting only the role string. Optional so the many synthesized contexts
   * (login, provisioning `targetCtx`, register) stay valid without it.
   */
  isSuperadmin?: boolean;
}

/**
 * Run `fn` inside a transaction with the Postgres RLS context set, so
 * row-level-security policies (drizzle/rls/enable-rls.sql) filter by tenant.
 *
 * Uses `set_config(..., true)` (transaction-local, parameterized → injection-safe)
 * instead of raw `SET LOCAL`, which can't bind parameters. A `superadmin` role
 * bypasses tenant filtering per policy (doc 26).
 *
 * RLS (drizzle/rls/enable-rls.sql) is APPLIED. Under the NOBYPASSRLS `app_user`
 * role (APP_POSTGRES_URL) these set_config calls are load-bearing — they drive the
 * tenant filtering. Under the owner role (BYPASSRLS) they're a harmless no-op. The
 * pre-tenant (login) path uses `withUserContext` below.
 */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // ONE round-trip for all three GUCs (was three separate awaits). On the
    // serverless→Neon path every await is a network round-trip, so a page with N
    // withTenant queries was paying 3N extra round-trips — a big chunk of the
    // per-page latency. set_config(...,true) stays transaction-local (RLS-safe).
    await tx.execute(
      sql`select set_config('app.tenant_id', ${ctx.tenantId}, true), set_config('app.user_id', ${ctx.userId}, true), set_config('app.role', ${ctx.role}, true)`,
    );
    return fn(tx);
  });
}

/**
 * Set ONLY `app.user_id` for a PRE-TENANT query (login / session resolution) —
 * before a tenant is chosen, so `app.tenant_id` can't be set yet. The `membership`
 * RLS policy allows `user_id = app.user_id`, so resolving "which tenant is this
 * user in?" works under the NOBYPASSRLS `app_user` role. `tenant_id`/`role` stay
 * unset, so tenant-scoped tables remain fail-closed. Harmless no-op under the owner
 * (BYPASSRLS) role.
 */
export async function withUserContext<T>(
  userId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
