import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { withTenant, withUserContext, type TenantContext } from "@/lib/db/tenant-context";
import {
  tenantTable,
  appUserTable,
  membershipTable,
  usageCounterTable,
  type TenantRow,
  type TenantInsert,
  type AppUserRow,
  type AppUserInsert,
  type MembershipRow,
  type MembershipInsert,
  type UsageCounterRow,
} from "./schema";

/**
 * tenant domain repo — the ONLY place that touches the tenant/app_user/
 * membership/usage_counter tables. Services call the repo; routes call services.
 *
 * `tenant` + `app_user` are GLOBAL (no tenant_id) → plain `db`. `membership` +
 * `usage_counter` are tenant-scoped → wrapped in `withTenant` (reusing the
 * existing RLS context helper). Every list read filters `deleted_at IS NULL`;
 * `listTrashed` flips to ONLY soft-deleted rows. Soft delete sets `deleted_at`;
 * restore clears it.
 */
export const tenantRepo = {
  // ── tenant (global) ──────────────────────────────────────────────
  async listTenants(): Promise<TenantRow[]> {
    return db
      .select()
      .from(tenantTable)
      .where(isNull(tenantTable.deletedAt))
      .orderBy(desc(tenantTable.createdAt));
  },

  async listTrashedTenants(): Promise<TenantRow[]> {
    return db
      .select()
      .from(tenantTable)
      .where(isNotNull(tenantTable.deletedAt))
      .orderBy(desc(tenantTable.deletedAt));
  },

  async getTenant(id: string): Promise<TenantRow | undefined> {
    const [row] = await db
      .select()
      .from(tenantTable)
      .where(and(eq(tenantTable.id, id), isNull(tenantTable.deletedAt)))
      .limit(1);
    return row;
  },

  async getTenantBySlug(slug: string): Promise<TenantRow | undefined> {
    const [row] = await db
      .select()
      .from(tenantTable)
      .where(and(eq(tenantTable.slug, slug), isNull(tenantTable.deletedAt)))
      .limit(1);
    return row;
  },

  async insertTenant(values: TenantInsert): Promise<TenantRow> {
    const [row] = await db.insert(tenantTable).values(values).returning();
    return row;
  },

  async updateTenant(id: string, patch: Partial<TenantInsert>): Promise<TenantRow | undefined> {
    const [row] = await db
      .update(tenantTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(tenantTable.id, id), isNull(tenantTable.deletedAt)))
      .returning();
    return row;
  },

  async softDeleteTenant(id: string): Promise<boolean> {
    const rows = await db
      .update(tenantTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tenantTable.id, id), isNull(tenantTable.deletedAt)))
      .returning({ id: tenantTable.id });
    return rows.length > 0;
  },

  async restoreTenant(id: string): Promise<boolean> {
    const rows = await db
      .update(tenantTable)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(tenantTable.id, id), isNotNull(tenantTable.deletedAt)))
      .returning({ id: tenantTable.id });
    return rows.length > 0;
  },

  /**
   * PERMANENT delete — a real SQL `DELETE` that drops the row for good (purge from
   * trash). Distinct from `softDeleteTenant` (sets `deleted_at`). Matches on `id`
   * alone (regardless of `deleted_at`) so a row can be purged whether it was
   * soft-deleted first or not. Returns true if a row was removed.
   */
  async hardDeleteTenant(id: string): Promise<boolean> {
    const rows = await db
      .delete(tenantTable)
      .where(eq(tenantTable.id, id))
      .returning({ id: tenantTable.id });
    return rows.length > 0;
  },

  /** Cross-tenant status rollup (active|pending|suspended|…) for the superadmin
   *  overview. Counts only live (non-deleted) tenants. */
  async countTenantsByStatus(): Promise<{ status: string; count: number }[]> {
    return db
      .select({ status: tenantTable.status, count: count() })
      .from(tenantTable)
      .where(isNull(tenantTable.deletedAt))
      .groupBy(tenantTable.status);
  },

  // ── app_user (global) ────────────────────────────────────────────
  async listUsers(): Promise<AppUserRow[]> {
    return db
      .select()
      .from(appUserTable)
      .where(isNull(appUserTable.deletedAt))
      .orderBy(desc(appUserTable.createdAt));
  },

  /** Count live users; `superadminOnly` restricts to platform staff. */
  async countUsers(superadminOnly = false): Promise<number> {
    const where = superadminOnly
      ? and(isNull(appUserTable.deletedAt), eq(appUserTable.isSuperadmin, true))
      : isNull(appUserTable.deletedAt);
    const [row] = await db.select({ n: count() }).from(appUserTable).where(where);
    return row?.n ?? 0;
  },

  async getUserByEmail(email: string): Promise<AppUserRow | undefined> {
    const [row] = await db
      .select()
      .from(appUserTable)
      .where(and(eq(appUserTable.email, email), isNull(appUserTable.deletedAt)))
      .limit(1);
    return row;
  },

  async getUserById(id: string): Promise<AppUserRow | undefined> {
    const [row] = await db
      .select()
      .from(appUserTable)
      .where(and(eq(appUserTable.id, id), isNull(appUserTable.deletedAt)))
      .limit(1);
    return row;
  },

  async insertUser(values: AppUserInsert): Promise<AppUserRow> {
    const [row] = await db.insert(appUserTable).values(values).returning();
    return row;
  },

  async updateUser(id: string, patch: Partial<AppUserInsert>): Promise<AppUserRow | undefined> {
    const [row] = await db
      .update(appUserTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(appUserTable.id, id), isNull(appUserTable.deletedAt)))
      .returning();
    return row;
  },

  // ── membership (tenant-scoped) ───────────────────────────────────
  async listMemberships(ctx: TenantContext): Promise<MembershipRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(membershipTable)
        .where(and(eq(membershipTable.tenantId, ctx.tenantId), isNull(membershipTable.deletedAt))),
    );
  },

  async getMembership(ctx: TenantContext, userId: string): Promise<MembershipRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(membershipTable)
        .where(
          and(
            eq(membershipTable.tenantId, ctx.tenantId),
            eq(membershipTable.userId, userId),
            isNull(membershipTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertMembership(ctx: TenantContext, values: MembershipInsert): Promise<MembershipRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(membershipTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  /**
   * Resolve a user's primary membership across ALL tenants (no tenant scope).
   * Login needs this to discover which tenant + role a credential maps to before
   * a TenantContext exists, so it deliberately runs unscoped on the global `db`.
   */
  async firstMembershipForUser(userId: string): Promise<MembershipRow | undefined> {
    // Pre-tenant (login) read: set app.user_id so the membership RLS policy
    // (user_id = app.user_id) resolves the user's tenant under the app_user role.
    const [row] = await withUserContext(userId, (tx) =>
      tx
        .select()
        .from(membershipTable)
        .where(and(eq(membershipTable.userId, userId), isNull(membershipTable.deletedAt)))
        .orderBy(desc(membershipTable.createdAt))
        .limit(1),
    );
    return row;
  },

  /** Count active (non-deleted) memberships — drives the seats quota check. */
  async countActiveMembers(ctx: TenantContext): Promise<number> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select({ n: count() })
        .from(membershipTable)
        .where(and(eq(membershipTable.tenantId, ctx.tenantId), isNull(membershipTable.deletedAt))),
    );
    return row?.n ?? 0;
  },

  // ── usage_counter (tenant-scoped quota rollup) ───────────────────
  async listUsage(ctx: TenantContext): Promise<UsageCounterRow[]> {
    return withTenant(ctx, (tx) =>
      tx.select().from(usageCounterTable).where(eq(usageCounterTable.tenantId, ctx.tenantId)),
    );
  },

  async getUsage(
    ctx: TenantContext,
    metric: string,
    period: string,
  ): Promise<UsageCounterRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(usageCounterTable)
        .where(
          and(
            eq(usageCounterTable.tenantId, ctx.tenantId),
            eq(usageCounterTable.metric, metric),
            eq(usageCounterTable.period, period),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Upsert a quota row (used when superadmin sets/overrides a tenant's limit). */
  async upsertUsage(
    ctx: TenantContext,
    metric: string,
    period: string,
    patch: { used?: number; quotaLimit?: number | null },
  ): Promise<UsageCounterRow> {
    const id = `usg_${ctx.tenantId}_${metric}_${period}`;
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(usageCounterTable)
        .values({
          id,
          tenantId: ctx.tenantId,
          metric,
          period,
          used: patch.used ?? 0,
          quotaLimit: patch.quotaLimit ?? null,
        })
        .onConflictDoUpdate({
          target: [usageCounterTable.tenantId, usageCounterTable.metric, usageCounterTable.period],
          set: {
            ...(patch.used !== undefined ? { used: patch.used } : {}),
            ...(patch.quotaLimit !== undefined ? { quotaLimit: patch.quotaLimit } : {}),
            updatedAt: new Date(),
          },
        })
        .returning(),
    );
    return row;
  },
};
