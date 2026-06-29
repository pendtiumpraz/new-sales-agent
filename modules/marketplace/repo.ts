import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  marketplaceIntegrationTable,
  marketplaceListingTable,
  type MarketplaceIntegrationRow,
  type MarketplaceIntegrationInsert,
  type MarketplaceListingRow,
  type MarketplaceListingInsert,
} from "./schema";

/**
 * marketplace repo — the ONLY place that touches the two marketplace tables
 * (`marketplace_integration`, `marketplace_listing_v2`). Both are TENANT-scoped,
 * so every read/write is wrapped in `withTenant` and filtered by `tenant_id`.
 *
 * Standard list/get/insert/update + soft-delete contract per entity. No FKs —
 * cross-entity integrity + cascade (listings under an integration) live in the
 * service layer.
 */
export const marketplaceRepo = {
  // ═══════════════════════ marketplace_integration ══════════════════
  async listIntegrations(
    ctx: TenantContext,
    filter?: { channel?: string; status?: string; workspaceId?: string },
  ): Promise<MarketplaceIntegrationRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(marketplaceIntegrationTable)
        .where(
          and(
            eq(marketplaceIntegrationTable.tenantId, ctx.tenantId),
            isNull(marketplaceIntegrationTable.deletedAt),
            filter?.channel ? eq(marketplaceIntegrationTable.channel, filter.channel) : undefined,
            filter?.status ? eq(marketplaceIntegrationTable.status, filter.status) : undefined,
            filter?.workspaceId
              ? eq(marketplaceIntegrationTable.workspaceId, filter.workspaceId)
              : undefined,
          ),
        )
        .orderBy(desc(marketplaceIntegrationTable.updatedAt)),
    );
  },

  async listTrashedIntegrations(ctx: TenantContext): Promise<MarketplaceIntegrationRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(marketplaceIntegrationTable)
        .where(
          and(
            eq(marketplaceIntegrationTable.tenantId, ctx.tenantId),
            isNotNull(marketplaceIntegrationTable.deletedAt),
          ),
        )
        .orderBy(desc(marketplaceIntegrationTable.deletedAt)),
    );
  },

  async getIntegration(
    ctx: TenantContext,
    id: string,
  ): Promise<MarketplaceIntegrationRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(marketplaceIntegrationTable)
        .where(
          and(
            eq(marketplaceIntegrationTable.tenantId, ctx.tenantId),
            eq(marketplaceIntegrationTable.id, id),
            isNull(marketplaceIntegrationTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertIntegration(
    ctx: TenantContext,
    values: MarketplaceIntegrationInsert,
  ): Promise<MarketplaceIntegrationRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(marketplaceIntegrationTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateIntegration(
    ctx: TenantContext,
    id: string,
    patch: Partial<MarketplaceIntegrationInsert>,
  ): Promise<MarketplaceIntegrationRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(marketplaceIntegrationTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(marketplaceIntegrationTable.tenantId, ctx.tenantId),
            eq(marketplaceIntegrationTable.id, id),
            isNull(marketplaceIntegrationTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteIntegration(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(marketplaceIntegrationTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(marketplaceIntegrationTable.tenantId, ctx.tenantId),
            eq(marketplaceIntegrationTable.id, id),
            isNull(marketplaceIntegrationTable.deletedAt),
          ),
        )
        .returning({ id: marketplaceIntegrationTable.id }),
    );
    return rows.length > 0;
  },

  async restoreIntegration(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(marketplaceIntegrationTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(marketplaceIntegrationTable.tenantId, ctx.tenantId),
            eq(marketplaceIntegrationTable.id, id),
            isNotNull(marketplaceIntegrationTable.deletedAt),
          ),
        )
        .returning({ id: marketplaceIntegrationTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteIntegration(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(marketplaceIntegrationTable)
        .where(
          and(
            eq(marketplaceIntegrationTable.tenantId, ctx.tenantId),
            eq(marketplaceIntegrationTable.id, id),
          ),
        )
        .returning({ id: marketplaceIntegrationTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ marketplace_listing_v2 ═══════════════════
  async listListings(
    ctx: TenantContext,
    filter?: { integrationId?: string; productId?: string; channel?: string; status?: string },
  ): Promise<MarketplaceListingRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(marketplaceListingTable)
        .where(
          and(
            eq(marketplaceListingTable.tenantId, ctx.tenantId),
            isNull(marketplaceListingTable.deletedAt),
            filter?.integrationId
              ? eq(marketplaceListingTable.integrationId, filter.integrationId)
              : undefined,
            filter?.productId ? eq(marketplaceListingTable.productId, filter.productId) : undefined,
            filter?.channel ? eq(marketplaceListingTable.channel, filter.channel) : undefined,
            filter?.status ? eq(marketplaceListingTable.status, filter.status) : undefined,
          ),
        )
        .orderBy(desc(marketplaceListingTable.updatedAt)),
    );
  },

  /** Count LIVE listings of an integration — drives the denormalized count. */
  async countListings(ctx: TenantContext, integrationId: string): Promise<number> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({ id: marketplaceListingTable.id })
        .from(marketplaceListingTable)
        .where(
          and(
            eq(marketplaceListingTable.tenantId, ctx.tenantId),
            eq(marketplaceListingTable.integrationId, integrationId),
            isNull(marketplaceListingTable.deletedAt),
          ),
        ),
    );
    return rows.length;
  },

  async listTrashedListings(ctx: TenantContext): Promise<MarketplaceListingRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(marketplaceListingTable)
        .where(
          and(
            eq(marketplaceListingTable.tenantId, ctx.tenantId),
            isNotNull(marketplaceListingTable.deletedAt),
          ),
        )
        .orderBy(desc(marketplaceListingTable.deletedAt)),
    );
  },

  async getListing(ctx: TenantContext, id: string): Promise<MarketplaceListingRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(marketplaceListingTable)
        .where(
          and(
            eq(marketplaceListingTable.tenantId, ctx.tenantId),
            eq(marketplaceListingTable.id, id),
            isNull(marketplaceListingTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertListing(
    ctx: TenantContext,
    values: MarketplaceListingInsert,
  ): Promise<MarketplaceListingRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(marketplaceListingTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateListing(
    ctx: TenantContext,
    id: string,
    patch: Partial<MarketplaceListingInsert>,
  ): Promise<MarketplaceListingRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(marketplaceListingTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(marketplaceListingTable.tenantId, ctx.tenantId),
            eq(marketplaceListingTable.id, id),
            isNull(marketplaceListingTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteListing(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(marketplaceListingTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(marketplaceListingTable.tenantId, ctx.tenantId),
            eq(marketplaceListingTable.id, id),
            isNull(marketplaceListingTable.deletedAt),
          ),
        )
        .returning({ id: marketplaceListingTable.id }),
    );
    return rows.length > 0;
  },

  async restoreListing(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(marketplaceListingTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(marketplaceListingTable.tenantId, ctx.tenantId),
            eq(marketplaceListingTable.id, id),
            isNotNull(marketplaceListingTable.deletedAt),
          ),
        )
        .returning({ id: marketplaceListingTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteListing(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(marketplaceListingTable)
        .where(
          and(
            eq(marketplaceListingTable.tenantId, ctx.tenantId),
            eq(marketplaceListingTable.id, id),
          ),
        )
        .returning({ id: marketplaceListingTable.id }),
    );
    return rows.length > 0;
  },

  /** Cascade helper: flip deleted_at on every listing of an integration. */
  async setListingsDeletedByIntegration(
    ctx: TenantContext,
    integrationId: string,
    deleted: boolean,
  ): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .update(marketplaceListingTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(marketplaceListingTable.tenantId, ctx.tenantId),
            eq(marketplaceListingTable.integrationId, integrationId),
            deleted
              ? isNull(marketplaceListingTable.deletedAt)
              : isNotNull(marketplaceListingTable.deletedAt),
          ),
        ),
    );
  },

  async hardDeleteListingsByIntegration(
    ctx: TenantContext,
    integrationId: string,
  ): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .delete(marketplaceListingTable)
        .where(
          and(
            eq(marketplaceListingTable.tenantId, ctx.tenantId),
            eq(marketplaceListingTable.integrationId, integrationId),
          ),
        ),
    );
  },
};
