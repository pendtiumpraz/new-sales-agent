import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  productTable,
  type ProductRow,
  type ProductInsert,
} from "./schema";

/**
 * product domain repo — the ONLY place that touches `product_v2`.
 *
 * Product is TENANT-scoped, so every read/write is wrapped in `withTenant`
 * (reusing the existing RLS context helper) and additionally filtered by
 * `tenant_id` in the WHERE. List/get reads filter `deleted_at IS NULL`;
 * `listTrashed` flips to ONLY soft-deleted rows. `softDelete` sets `deleted_at`,
 * `restore` clears it (only matching already-trashed rows), `hardDelete` issues
 * a real SQL DELETE (purge). Services call the repo; routes call services.
 */
export const productRepo = {
  async list(ctx: TenantContext): Promise<ProductRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(productTable)
        .where(and(eq(productTable.tenantId, ctx.tenantId), isNull(productTable.deletedAt)))
        .orderBy(desc(productTable.createdAt)),
    );
  },

  async listTrashed(ctx: TenantContext): Promise<ProductRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(productTable)
        .where(and(eq(productTable.tenantId, ctx.tenantId), isNotNull(productTable.deletedAt)))
        .orderBy(desc(productTable.deletedAt)),
    );
  },

  async get(ctx: TenantContext, id: string): Promise<ProductRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(productTable)
        .where(
          and(
            eq(productTable.tenantId, ctx.tenantId),
            eq(productTable.id, id),
            isNull(productTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insert(ctx: TenantContext, values: ProductInsert): Promise<ProductRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(productTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async update(
    ctx: TenantContext,
    id: string,
    patch: Partial<ProductInsert>,
  ): Promise<ProductRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(productTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(productTable.tenantId, ctx.tenantId),
            eq(productTable.id, id),
            isNull(productTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDelete(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(productTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(productTable.tenantId, ctx.tenantId),
            eq(productTable.id, id),
            isNull(productTable.deletedAt),
          ),
        )
        .returning({ id: productTable.id }),
    );
    return rows.length > 0;
  },

  async restore(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(productTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(productTable.tenantId, ctx.tenantId),
            eq(productTable.id, id),
            isNotNull(productTable.deletedAt),
          ),
        )
        .returning({ id: productTable.id }),
    );
    return rows.length > 0;
  },

  /**
   * PERMANENT delete — a real SQL DELETE that drops the row for good (purge from
   * trash). Matches on `(tenant_id, id)` regardless of `deleted_at`, so a row can
   * be purged whether or not it was soft-deleted first. Returns true if removed.
   */
  async hardDelete(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(productTable)
        .where(and(eq(productTable.tenantId, ctx.tenantId), eq(productTable.id, id)))
        .returning({ id: productTable.id }),
    );
    return rows.length > 0;
  },

  /** Count workspaces that reference a product — guards delete (service-level). */
  async existsActive(ctx: TenantContext, id: string): Promise<boolean> {
    const row = await this.get(ctx, id);
    return Boolean(row);
  },
};
