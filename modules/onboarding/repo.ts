import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  verticalTable,
  moduleCatalogTable,
  tenantEntitlementTable,
  onboardingStateTable,
  type VerticalRow,
  type VerticalInsert,
  type ModuleCatalogRow,
  type ModuleCatalogInsert,
  type TenantEntitlementRow,
  type OnboardingStateRow,
  type OnboardingStateInsert,
} from "./schema";

/**
 * onboarding domain repo — the ONLY place that touches the vertical /
 * module_catalog / tenant_entitlement_v2 / onboarding_state tables. Services
 * call the repo; routes call services.
 *
 * `vertical` + `module_catalog` are GLOBAL catalogs (no tenant_id) → plain `db`,
 * with soft-delete (`deleted_at`): list reads filter `deleted_at IS NULL`,
 * `listTrashed*` flips to ONLY soft-deleted rows, `restore*` clears it.
 * `tenant_entitlement_v2` + `onboarding_state` are TENANT-scoped → wrapped in
 * `withTenant` (reusing the existing RLS context helper). Those two use an
 * `enabled` flag / 1:1 satellite shape instead of soft-delete per the schema
 * inventory (design doc §3), so they have no trashed/restore.
 */
export const onboardingRepo = {
  // ── vertical (GLOBAL catalog, soft-delete) ───────────────────────
  async listVerticals(): Promise<VerticalRow[]> {
    return db
      .select()
      .from(verticalTable)
      .where(isNull(verticalTable.deletedAt))
      .orderBy(asc(verticalTable.sort), asc(verticalTable.name));
  },

  async listTrashedVerticals(): Promise<VerticalRow[]> {
    return db
      .select()
      .from(verticalTable)
      .where(isNotNull(verticalTable.deletedAt))
      .orderBy(desc(verticalTable.deletedAt));
  },

  async getVertical(id: string): Promise<VerticalRow | undefined> {
    const [row] = await db
      .select()
      .from(verticalTable)
      .where(and(eq(verticalTable.id, id), isNull(verticalTable.deletedAt)))
      .limit(1);
    return row;
  },

  async getVerticalByKey(key: string): Promise<VerticalRow | undefined> {
    const [row] = await db
      .select()
      .from(verticalTable)
      .where(and(eq(verticalTable.key, key), isNull(verticalTable.deletedAt)))
      .limit(1);
    return row;
  },

  async insertVertical(values: VerticalInsert): Promise<VerticalRow> {
    const [row] = await db.insert(verticalTable).values(values).returning();
    return row;
  },

  async updateVertical(
    id: string,
    patch: Partial<VerticalInsert>,
  ): Promise<VerticalRow | undefined> {
    const [row] = await db
      .update(verticalTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(verticalTable.id, id), isNull(verticalTable.deletedAt)))
      .returning();
    return row;
  },

  async softDeleteVertical(id: string): Promise<boolean> {
    const rows = await db
      .update(verticalTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(verticalTable.id, id), isNull(verticalTable.deletedAt)))
      .returning({ id: verticalTable.id });
    return rows.length > 0;
  },

  async restoreVertical(id: string): Promise<boolean> {
    const rows = await db
      .update(verticalTable)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(verticalTable.id, id), isNotNull(verticalTable.deletedAt)))
      .returning({ id: verticalTable.id });
    return rows.length > 0;
  },

  /** Real SQL DELETE (purge). Permanent — used by the trash "Hapus permanen" path. */
  async hardDeleteVertical(id: string): Promise<boolean> {
    const rows = await db
      .delete(verticalTable)
      .where(eq(verticalTable.id, id))
      .returning({ id: verticalTable.id });
    return rows.length > 0;
  },

  // ── module_catalog (GLOBAL catalog, soft-delete) ─────────────────
  async listModules(): Promise<ModuleCatalogRow[]> {
    return db
      .select()
      .from(moduleCatalogTable)
      .where(isNull(moduleCatalogTable.deletedAt))
      .orderBy(asc(moduleCatalogTable.sort), asc(moduleCatalogTable.label));
  },

  async listTrashedModules(): Promise<ModuleCatalogRow[]> {
    return db
      .select()
      .from(moduleCatalogTable)
      .where(isNotNull(moduleCatalogTable.deletedAt))
      .orderBy(desc(moduleCatalogTable.deletedAt));
  },

  async getModule(id: string): Promise<ModuleCatalogRow | undefined> {
    const [row] = await db
      .select()
      .from(moduleCatalogTable)
      .where(and(eq(moduleCatalogTable.id, id), isNull(moduleCatalogTable.deletedAt)))
      .limit(1);
    return row;
  },

  async getModuleByKey(moduleKey: string): Promise<ModuleCatalogRow | undefined> {
    const [row] = await db
      .select()
      .from(moduleCatalogTable)
      .where(and(eq(moduleCatalogTable.moduleKey, moduleKey), isNull(moduleCatalogTable.deletedAt)))
      .limit(1);
    return row;
  },

  async insertModule(values: ModuleCatalogInsert): Promise<ModuleCatalogRow> {
    const [row] = await db.insert(moduleCatalogTable).values(values).returning();
    return row;
  },

  async softDeleteModule(id: string): Promise<boolean> {
    const rows = await db
      .update(moduleCatalogTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(moduleCatalogTable.id, id), isNull(moduleCatalogTable.deletedAt)))
      .returning({ id: moduleCatalogTable.id });
    return rows.length > 0;
  },

  async restoreModule(id: string): Promise<boolean> {
    const rows = await db
      .update(moduleCatalogTable)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(moduleCatalogTable.id, id), isNotNull(moduleCatalogTable.deletedAt)))
      .returning({ id: moduleCatalogTable.id });
    return rows.length > 0;
  },

  /** Real SQL DELETE (purge). Permanent — used by the trash "Hapus permanen" path. */
  async hardDeleteModule(id: string): Promise<boolean> {
    const rows = await db
      .delete(moduleCatalogTable)
      .where(eq(moduleCatalogTable.id, id))
      .returning({ id: moduleCatalogTable.id });
    return rows.length > 0;
  },

  // ── tenant_entitlement_v2 (TENANT — per-module on/off + quota override) ──
  async listEntitlements(ctx: TenantContext): Promise<TenantEntitlementRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(tenantEntitlementTable)
        .where(eq(tenantEntitlementTable.tenantId, ctx.tenantId)),
    );
  },

  async getEntitlement(
    ctx: TenantContext,
    moduleKey: string,
  ): Promise<TenantEntitlementRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(tenantEntitlementTable)
        .where(
          and(
            eq(tenantEntitlementTable.tenantId, ctx.tenantId),
            eq(tenantEntitlementTable.moduleKey, moduleKey),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Upsert a per-tenant module entitlement (enabled flag + optional quota overrides). */
  async upsertEntitlement(
    ctx: TenantContext,
    moduleKey: string,
    patch: { enabled?: boolean; quotaOverrides?: Record<string, number> },
  ): Promise<TenantEntitlementRow> {
    const id = `ent_${ctx.tenantId}_${moduleKey}`;
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(tenantEntitlementTable)
        .values({
          id,
          tenantId: ctx.tenantId,
          moduleKey,
          enabled: patch.enabled ?? true,
          quotaOverrides: patch.quotaOverrides ?? {},
        })
        .onConflictDoUpdate({
          target: [tenantEntitlementTable.tenantId, tenantEntitlementTable.moduleKey],
          set: {
            ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
            ...(patch.quotaOverrides !== undefined
              ? { quotaOverrides: patch.quotaOverrides }
              : {}),
            updatedAt: new Date(),
          },
        })
        .returning(),
    );
    return row;
  },

  // ── onboarding_state (TENANT — 1:1 with tenant) ──────────────────
  async getState(ctx: TenantContext): Promise<OnboardingStateRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(onboardingStateTable)
        .where(eq(onboardingStateTable.tenantId, ctx.tenantId))
        .limit(1),
    );
    return row;
  },

  /** Upsert the single onboarding_state row for the tenant (PK = tenant_id). */
  async upsertState(
    ctx: TenantContext,
    patch: Partial<Omit<OnboardingStateInsert, "tenantId">>,
  ): Promise<OnboardingStateRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(onboardingStateTable)
        .values({ tenantId: ctx.tenantId, ...patch })
        .onConflictDoUpdate({
          target: onboardingStateTable.tenantId,
          set: { ...patch, updatedAt: new Date() },
        })
        .returning(),
    );
    return row;
  },
};
