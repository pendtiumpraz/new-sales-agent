import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  marketplaceOrderTable,
  cartRecoveryTable,
  type MarketplaceOrderRow,
  type MarketplaceOrderInsert,
  type CartRecoveryRow,
  type CartRecoveryInsert,
} from "./schema";

/**
 * ecommerce repo — the ONLY place that touches the two ecommerce tables
 * (`marketplace_order`, `cart_recovery`). Both are TENANT-scoped, so every
 * read/write is wrapped in `withTenant` and filtered by `tenant_id`.
 *
 * Standard list/get/insert/update + soft-delete contract per entity. `find*ByExternal`
 * supports idempotent channel ingest (one row per tenant+channel+external_id).
 * No FKs — cross-entity integrity lives in the service layer.
 */
export const ecommerceRepo = {
  // ═══════════════════════ marketplace_order ════════════════════════
  async listOrders(
    ctx: TenantContext,
    filter?: { channel?: string; status?: string; contactId?: string; workspaceId?: string },
  ): Promise<MarketplaceOrderRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(marketplaceOrderTable)
        .where(
          and(
            eq(marketplaceOrderTable.tenantId, ctx.tenantId),
            isNull(marketplaceOrderTable.deletedAt),
            filter?.channel ? eq(marketplaceOrderTable.channel, filter.channel) : undefined,
            filter?.status ? eq(marketplaceOrderTable.status, filter.status) : undefined,
            filter?.contactId ? eq(marketplaceOrderTable.contactId, filter.contactId) : undefined,
            filter?.workspaceId
              ? eq(marketplaceOrderTable.workspaceId, filter.workspaceId)
              : undefined,
          ),
        )
        .orderBy(desc(marketplaceOrderTable.createdAt)),
    );
  },

  async listTrashedOrders(ctx: TenantContext): Promise<MarketplaceOrderRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(marketplaceOrderTable)
        .where(
          and(
            eq(marketplaceOrderTable.tenantId, ctx.tenantId),
            isNotNull(marketplaceOrderTable.deletedAt),
          ),
        )
        .orderBy(desc(marketplaceOrderTable.deletedAt)),
    );
  },

  async getOrder(ctx: TenantContext, id: string): Promise<MarketplaceOrderRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(marketplaceOrderTable)
        .where(
          and(
            eq(marketplaceOrderTable.tenantId, ctx.tenantId),
            eq(marketplaceOrderTable.id, id),
            isNull(marketplaceOrderTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Idempotent ingest lookup: find a live order by (channel, external_id). */
  async findOrderByExternal(
    ctx: TenantContext,
    channel: string,
    externalId: string,
  ): Promise<MarketplaceOrderRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(marketplaceOrderTable)
        .where(
          and(
            eq(marketplaceOrderTable.tenantId, ctx.tenantId),
            eq(marketplaceOrderTable.channel, channel),
            eq(marketplaceOrderTable.externalId, externalId),
            isNull(marketplaceOrderTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertOrder(
    ctx: TenantContext,
    values: MarketplaceOrderInsert,
  ): Promise<MarketplaceOrderRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(marketplaceOrderTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateOrder(
    ctx: TenantContext,
    id: string,
    patch: Partial<MarketplaceOrderInsert>,
  ): Promise<MarketplaceOrderRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(marketplaceOrderTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(marketplaceOrderTable.tenantId, ctx.tenantId),
            eq(marketplaceOrderTable.id, id),
            isNull(marketplaceOrderTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteOrder(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(marketplaceOrderTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(marketplaceOrderTable.tenantId, ctx.tenantId),
            eq(marketplaceOrderTable.id, id),
            isNull(marketplaceOrderTable.deletedAt),
          ),
        )
        .returning({ id: marketplaceOrderTable.id }),
    );
    return rows.length > 0;
  },

  async restoreOrder(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(marketplaceOrderTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(marketplaceOrderTable.tenantId, ctx.tenantId),
            eq(marketplaceOrderTable.id, id),
            isNotNull(marketplaceOrderTable.deletedAt),
          ),
        )
        .returning({ id: marketplaceOrderTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteOrder(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(marketplaceOrderTable)
        .where(
          and(eq(marketplaceOrderTable.tenantId, ctx.tenantId), eq(marketplaceOrderTable.id, id)),
        )
        .returning({ id: marketplaceOrderTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ cart_recovery ════════════════════════════
  async listCarts(
    ctx: TenantContext,
    filter?: { channel?: string; status?: string; workspaceId?: string },
  ): Promise<CartRecoveryRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cartRecoveryTable)
        .where(
          and(
            eq(cartRecoveryTable.tenantId, ctx.tenantId),
            isNull(cartRecoveryTable.deletedAt),
            filter?.channel ? eq(cartRecoveryTable.channel, filter.channel) : undefined,
            filter?.status ? eq(cartRecoveryTable.status, filter.status) : undefined,
            filter?.workspaceId ? eq(cartRecoveryTable.workspaceId, filter.workspaceId) : undefined,
          ),
        )
        .orderBy(desc(cartRecoveryTable.createdAt)),
    );
  },

  async listTrashedCarts(ctx: TenantContext): Promise<CartRecoveryRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cartRecoveryTable)
        .where(
          and(eq(cartRecoveryTable.tenantId, ctx.tenantId), isNotNull(cartRecoveryTable.deletedAt)),
        )
        .orderBy(desc(cartRecoveryTable.deletedAt)),
    );
  },

  async getCart(ctx: TenantContext, id: string): Promise<CartRecoveryRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cartRecoveryTable)
        .where(
          and(
            eq(cartRecoveryTable.tenantId, ctx.tenantId),
            eq(cartRecoveryTable.id, id),
            isNull(cartRecoveryTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Idempotent ingest lookup: find a live cart by (channel, external_id). */
  async findCartByExternal(
    ctx: TenantContext,
    channel: string,
    externalId: string,
  ): Promise<CartRecoveryRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cartRecoveryTable)
        .where(
          and(
            eq(cartRecoveryTable.tenantId, ctx.tenantId),
            eq(cartRecoveryTable.channel, channel),
            eq(cartRecoveryTable.externalId, externalId),
            isNull(cartRecoveryTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertCart(ctx: TenantContext, values: CartRecoveryInsert): Promise<CartRecoveryRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(cartRecoveryTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateCart(
    ctx: TenantContext,
    id: string,
    patch: Partial<CartRecoveryInsert>,
  ): Promise<CartRecoveryRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(cartRecoveryTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(cartRecoveryTable.tenantId, ctx.tenantId),
            eq(cartRecoveryTable.id, id),
            isNull(cartRecoveryTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteCart(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(cartRecoveryTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(cartRecoveryTable.tenantId, ctx.tenantId),
            eq(cartRecoveryTable.id, id),
            isNull(cartRecoveryTable.deletedAt),
          ),
        )
        .returning({ id: cartRecoveryTable.id }),
    );
    return rows.length > 0;
  },

  async restoreCart(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(cartRecoveryTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(cartRecoveryTable.tenantId, ctx.tenantId),
            eq(cartRecoveryTable.id, id),
            isNotNull(cartRecoveryTable.deletedAt),
          ),
        )
        .returning({ id: cartRecoveryTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteCart(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(cartRecoveryTable)
        .where(and(eq(cartRecoveryTable.tenantId, ctx.tenantId), eq(cartRecoveryTable.id, id)))
        .returning({ id: cartRecoveryTable.id }),
    );
    return rows.length > 0;
  },
};
