import { and, desc, eq, isNull } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { apiKeyTable, type ApiKeyRow, type ApiKeyInsert } from "./schema";

/**
 * api_key repo — the ONLY place that touches the `api_key` table. Tenant-scoped
 * reads/writes go through `withTenant` (RLS tenant_isolation applies). The one
 * exception is `findByHash` / `touchLastUsed`, the AUTH-TIME resolution path:
 * the key itself identifies the tenant, so the lookup must be tenant-UNSCOPED.
 *
 * Because `api_key` carries FORCED RLS (unlike the legacy `rep_account` table,
 * whose `resolveRepByToken` uses a bare `db` query), a bare unscoped `db` read
 * would fail-CLOSED under the NOBYPASSRLS `app_user` role (no `app.tenant_id`
 * set → matches no row). So the unscoped path runs under a SUPERADMIN RLS context
 * (`{ role: "superadmin" }`) — the exact pattern tenantRepo.findGrantByExternalRef
 * uses for its cross-tenant/system reads. The policy predicate
 * (`app.role = 'superadmin'`) bypasses the tenant pin; it works under both the
 * app_user role and the owner (BYPASSRLS) fallback.
 */
const SYS_CTX: TenantContext = { tenantId: "", userId: "system", role: "superadmin" };

export const apiKeyRepo = {
  /** Live (non-revoked, non-deleted) keys for the tenant, newest first. */
  async listByTenant(ctx: TenantContext): Promise<ApiKeyRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(apiKeyTable)
        .where(and(eq(apiKeyTable.tenantId, ctx.tenantId), isNull(apiKeyTable.deletedAt)))
        .orderBy(desc(apiKeyTable.createdAt)),
    );
  },

  async getById(ctx: TenantContext, id: string): Promise<ApiKeyRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(apiKeyTable)
        .where(
          and(
            eq(apiKeyTable.id, id),
            eq(apiKeyTable.tenantId, ctx.tenantId),
            isNull(apiKeyTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insert(ctx: TenantContext, values: ApiKeyInsert): Promise<ApiKeyRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(apiKeyTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  /**
   * Revoke a key (set revoked_at). Scoped to the ctx tenant; only matches a live,
   * not-yet-revoked row. Returns the row, or undefined when nothing matched.
   */
  async revoke(ctx: TenantContext, id: string): Promise<ApiKeyRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(apiKeyTable)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(apiKeyTable.id, id),
            eq(apiKeyTable.tenantId, ctx.tenantId),
            isNull(apiKeyTable.revokedAt),
            isNull(apiKeyTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  /**
   * AUTH-TIME cross-tenant lookup by key_hash — returns a LIVE key row (not
   * revoked, not deleted) or undefined. Runs under a superadmin RLS context (see
   * the file header) since the key, not a session, identifies the tenant.
   */
  async findByHash(keyHash: string): Promise<ApiKeyRow | undefined> {
    const [row] = await withTenant(SYS_CTX, (tx) =>
      tx
        .select()
        .from(apiKeyTable)
        .where(
          and(
            eq(apiKeyTable.keyHash, keyHash),
            isNull(apiKeyTable.revokedAt),
            isNull(apiKeyTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Best-effort `last_used_at` stamp on use (superadmin ctx, same rationale). */
  async touchLastUsed(id: string): Promise<void> {
    await withTenant(SYS_CTX, (tx) =>
      tx.update(apiKeyTable).set({ lastUsedAt: new Date() }).where(eq(apiKeyTable.id, id)),
    );
  },
};
