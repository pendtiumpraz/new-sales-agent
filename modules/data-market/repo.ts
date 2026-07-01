import { and, desc, eq, isNull, isNotNull, ne, sql } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  dataListingTable,
  dataPurchaseTable,
  type DataListingRow,
  type DataListingInsert,
  type DataPurchaseRow,
  type DataPurchaseInsert,
} from "./schema";

/**
 * data-market repo — the ONLY place that touches `data_listing` / `data_purchase`.
 *
 * CROSS-TENANT by design: `browseListings` reads OTHER tenants' ACTIVE listings
 * (the public shelf) — the app-level control is the explicit
 * `status='active' AND deleted_at IS NULL AND seller_tenant_id <> ctx` WHERE (the
 * SOLE control under the owner/BYPASSRLS fallback), backstopped by a bespoke
 * public-shelf RLS SELECT policy (drizzle/rls/enable-rls.sql) for the
 * NOBYPASSRLS `app_user` role. Every WRITE is pinned to `seller_tenant_id = ctx`
 * (seller-only), matching that file's write guard.
 *
 * LIGHT projection: list reads (`browse` / `mine` / `trashed`) NEVER select the
 * heavy `companies` snapshot — only `sample` (names) + metadata — so a big
 * dataset doesn't ship its whole payload on the shelf. `getActiveListing`
 * (purchase) is the only read that pulls `companies`.
 */

// Every column EXCEPT the heavy `companies` snapshot — the shelf/list shape.
const listingLight = {
  id: dataListingTable.id,
  sellerTenantId: dataListingTable.sellerTenantId,
  title: dataListingTable.title,
  description: dataListingTable.description,
  industryKey: dataListingTable.industryKey,
  segment: dataListingTable.segment,
  companyCount: dataListingTable.companyCount,
  price: dataListingTable.price,
  sample: dataListingTable.sample,
  status: dataListingTable.status,
  createdBy: dataListingTable.createdBy,
  createdAt: dataListingTable.createdAt,
  updatedAt: dataListingTable.updatedAt,
  deletedAt: dataListingTable.deletedAt,
} as const;

/** A shelf/list listing row (no `companies` payload). */
export type DataListingLite = Omit<DataListingRow, "companies">;

export const dataMarketRepo = {
  // ═══════════════════════ data_listing ═══════════════════════════════

  /**
   * BROWSE — the cross-tenant public shelf: ACTIVE, live listings from OTHER
   * tenants, newest first. Runs inside `withTenant(ctx)` so (under the app_user
   * role) the public-shelf RLS policy permits the cross-tenant rows; the explicit
   * WHERE is what actually filters under the owner fallback.
   */
  async browseListings(ctx: TenantContext): Promise<DataListingLite[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select(listingLight)
        .from(dataListingTable)
        .where(
          and(
            eq(dataListingTable.status, "active"),
            isNull(dataListingTable.deletedAt),
            ne(dataListingTable.sellerTenantId, ctx.tenantId),
          ),
        )
        .orderBy(desc(dataListingTable.createdAt)),
    );
  },

  /** MY listings (any status), live, newest first. Seller-scoped. */
  async listMyListings(ctx: TenantContext): Promise<DataListingLite[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select(listingLight)
        .from(dataListingTable)
        .where(
          and(
            eq(dataListingTable.sellerTenantId, ctx.tenantId),
            isNull(dataListingTable.deletedAt),
          ),
        )
        .orderBy(desc(dataListingTable.createdAt)),
    );
  },

  /** MY soft-deleted listings (the Sampah view). Seller-scoped. */
  async listMyTrashed(ctx: TenantContext): Promise<DataListingLite[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select(listingLight)
        .from(dataListingTable)
        .where(
          and(
            eq(dataListingTable.sellerTenantId, ctx.tenantId),
            isNotNull(dataListingTable.deletedAt),
          ),
        )
        .orderBy(desc(dataListingTable.deletedAt)),
    );
  },

  /** One of MY listings by id (light, live). Seller-scoped guard for pause/delete. */
  async getMyListing(ctx: TenantContext, id: string): Promise<DataListingLite | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select(listingLight)
        .from(dataListingTable)
        .where(
          and(
            eq(dataListingTable.id, id),
            eq(dataListingTable.sellerTenantId, ctx.tenantId),
            isNull(dataListingTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /**
   * A single ACTIVE, live listing by id from ANY tenant — WITH the heavy
   * `companies` payload (the purchase read). Cross-tenant: no seller pin, gated on
   * `status='active' AND deleted_at IS NULL` (matches the public-shelf policy).
   */
  async getActiveListing(ctx: TenantContext, id: string): Promise<DataListingRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(dataListingTable)
        .where(
          and(
            eq(dataListingTable.id, id),
            eq(dataListingTable.status, "active"),
            isNull(dataListingTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertListing(ctx: TenantContext, values: DataListingInsert): Promise<DataListingLite> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(dataListingTable)
        .values({ ...values, sellerTenantId: ctx.tenantId })
        .returning(listingLight),
    );
    return row;
  },

  /** Flip status (active⇄paused). Seller-scoped; only live rows. */
  async setListingStatus(
    ctx: TenantContext,
    id: string,
    status: string,
  ): Promise<DataListingLite | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(dataListingTable)
        .set({ status, updatedAt: new Date() })
        .where(
          and(
            eq(dataListingTable.id, id),
            eq(dataListingTable.sellerTenantId, ctx.tenantId),
            isNull(dataListingTable.deletedAt),
          ),
        )
        .returning(listingLight),
    );
    return row;
  },

  async softDeleteListing(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(dataListingTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(dataListingTable.id, id),
            eq(dataListingTable.sellerTenantId, ctx.tenantId),
            isNull(dataListingTable.deletedAt),
          ),
        )
        .returning({ id: dataListingTable.id }),
    );
    return rows.length > 0;
  },

  async restoreListing(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(dataListingTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(dataListingTable.id, id),
            eq(dataListingTable.sellerTenantId, ctx.tenantId),
            isNotNull(dataListingTable.deletedAt),
          ),
        )
        .returning({ id: dataListingTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteListing(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(dataListingTable)
        .where(
          and(eq(dataListingTable.id, id), eq(dataListingTable.sellerTenantId, ctx.tenantId)),
        )
        .returning({ id: dataListingTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ data_purchase ══════════════════════════════

  async insertPurchase(ctx: TenantContext, values: DataPurchaseInsert): Promise<DataPurchaseRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(dataPurchaseTable)
        .values({ ...values, buyerTenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  /** MY purchases (as buyer), newest first. */
  async listMyPurchases(ctx: TenantContext): Promise<DataPurchaseRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(dataPurchaseTable)
        .where(eq(dataPurchaseTable.buyerTenantId, ctx.tenantId))
        .orderBy(desc(dataPurchaseTable.createdAt)),
    );
  },

  // ═══════════════════════ stats ══════════════════════════════════════

  /** # of my ACTIVE, live listings. */
  async countMyActiveListings(ctx: TenantContext): Promise<number> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(dataListingTable)
        .where(
          and(
            eq(dataListingTable.sellerTenantId, ctx.tenantId),
            eq(dataListingTable.status, "active"),
            isNull(dataListingTable.deletedAt),
          ),
        ),
    );
    return row?.n ?? 0;
  },

  /** Total companies I've SOLD = sum(imported_count) over purchases of MY listings. */
  async sumCompaniesSold(ctx: TenantContext): Promise<number> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select({ total: sql<number>`coalesce(sum(${dataPurchaseTable.importedCount}),0)::int` })
        .from(dataPurchaseTable)
        .where(eq(dataPurchaseTable.sellerTenantId, ctx.tenantId)),
    );
    return Number(row?.total ?? 0);
  },

  /** # of my purchases (as buyer). */
  async countMyPurchases(ctx: TenantContext): Promise<number> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(dataPurchaseTable)
        .where(eq(dataPurchaseTable.buyerTenantId, ctx.tenantId)),
    );
    return row?.n ?? 0;
  },
};
