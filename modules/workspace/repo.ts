import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  workspaceTable,
  marketFitTable,
  salesPlayTable,
  type WorkspaceRow,
  type WorkspaceInsert,
  type MarketFitRow,
  type MarketFitInsert,
  type SalesPlayRow,
  type SalesPlayInsert,
} from "./schema";

/**
 * workspace domain repo — the ONLY place that touches `workspace_v2`,
 * `market_fit`, and `sales_play`. All three are TENANT-scoped, so every
 * read/write is wrapped in `withTenant` and filtered by `tenant_id`.
 *
 * `market_fit` + `sales_play` are 1:1 satellites of a workspace — the repo
 * exposes get/upsert/softDelete/restore/hardDelete for each so the service can
 * cascade them when their parent workspace is trashed/restored/purged. List/get
 * reads filter `deleted_at IS NULL`; `*Trashed` flips to ONLY soft-deleted rows.
 */
export const workspaceRepo = {
  // ── workspace_v2 ─────────────────────────────────────────────────
  async list(ctx: TenantContext): Promise<WorkspaceRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(workspaceTable)
        .where(and(eq(workspaceTable.tenantId, ctx.tenantId), isNull(workspaceTable.deletedAt)))
        .orderBy(desc(workspaceTable.createdAt)),
    );
  },

  async listTrashed(ctx: TenantContext): Promise<WorkspaceRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(workspaceTable)
        .where(and(eq(workspaceTable.tenantId, ctx.tenantId), isNotNull(workspaceTable.deletedAt)))
        .orderBy(desc(workspaceTable.deletedAt)),
    );
  },

  async get(ctx: TenantContext, id: string): Promise<WorkspaceRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(workspaceTable)
        .where(
          and(
            eq(workspaceTable.tenantId, ctx.tenantId),
            eq(workspaceTable.id, id),
            isNull(workspaceTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Count live workspaces pointing at a product (delete-guard for product). */
  async listByProduct(ctx: TenantContext, productId: string): Promise<WorkspaceRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(workspaceTable)
        .where(
          and(
            eq(workspaceTable.tenantId, ctx.tenantId),
            eq(workspaceTable.productId, productId),
            isNull(workspaceTable.deletedAt),
          ),
        ),
    );
  },

  async insert(ctx: TenantContext, values: WorkspaceInsert): Promise<WorkspaceRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(workspaceTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async update(
    ctx: TenantContext,
    id: string,
    patch: Partial<WorkspaceInsert>,
  ): Promise<WorkspaceRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(workspaceTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(workspaceTable.tenantId, ctx.tenantId),
            eq(workspaceTable.id, id),
            isNull(workspaceTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDelete(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(workspaceTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(workspaceTable.tenantId, ctx.tenantId),
            eq(workspaceTable.id, id),
            isNull(workspaceTable.deletedAt),
          ),
        )
        .returning({ id: workspaceTable.id }),
    );
    return rows.length > 0;
  },

  async restore(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(workspaceTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(workspaceTable.tenantId, ctx.tenantId),
            eq(workspaceTable.id, id),
            isNotNull(workspaceTable.deletedAt),
          ),
        )
        .returning({ id: workspaceTable.id }),
    );
    return rows.length > 0;
  },

  async hardDelete(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(workspaceTable)
        .where(and(eq(workspaceTable.tenantId, ctx.tenantId), eq(workspaceTable.id, id)))
        .returning({ id: workspaceTable.id }),
    );
    return rows.length > 0;
  },

  // ── market_fit (1:1 satellite) ───────────────────────────────────
  async getMarketFit(ctx: TenantContext, workspaceId: string): Promise<MarketFitRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(marketFitTable)
        .where(
          and(
            eq(marketFitTable.tenantId, ctx.tenantId),
            eq(marketFitTable.workspaceId, workspaceId),
            isNull(marketFitTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Upsert the workspace's single market-fit result (1:1 on (tenant,workspace)). */
  async upsertMarketFit(
    ctx: TenantContext,
    workspaceId: string,
    values: Omit<MarketFitInsert, "id" | "tenantId" | "workspaceId">,
  ): Promise<MarketFitRow> {
    const id = "mft_" + crypto.randomUUID();
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(marketFitTable)
        .values({ ...values, id, tenantId: ctx.tenantId, workspaceId })
        .onConflictDoUpdate({
          target: [marketFitTable.tenantId, marketFitTable.workspaceId],
          set: { ...values, deletedAt: null, updatedAt: new Date() },
        })
        .returning(),
    );
    return row;
  },

  async setMarketFitDeleted(
    ctx: TenantContext,
    workspaceIds: string[],
    deleted: boolean,
  ): Promise<void> {
    if (workspaceIds.length === 0) return;
    await withTenant(ctx, (tx) =>
      tx
        .update(marketFitTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(marketFitTable.tenantId, ctx.tenantId),
            inArray(marketFitTable.workspaceId, workspaceIds),
          ),
        ),
    );
  },

  async hardDeleteMarketFit(ctx: TenantContext, workspaceId: string): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .delete(marketFitTable)
        .where(
          and(
            eq(marketFitTable.tenantId, ctx.tenantId),
            eq(marketFitTable.workspaceId, workspaceId),
          ),
        ),
    );
  },

  // ── sales_play (1:1 satellite) ───────────────────────────────────
  async getSalesPlay(ctx: TenantContext, workspaceId: string): Promise<SalesPlayRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(salesPlayTable)
        .where(
          and(
            eq(salesPlayTable.tenantId, ctx.tenantId),
            eq(salesPlayTable.workspaceId, workspaceId),
            isNull(salesPlayTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Upsert the workspace's single sales-play config (1:1 on (tenant,workspace)). */
  async upsertSalesPlay(
    ctx: TenantContext,
    workspaceId: string,
    values: Omit<SalesPlayInsert, "id" | "tenantId" | "workspaceId">,
  ): Promise<SalesPlayRow> {
    const id = "ply_" + crypto.randomUUID();
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(salesPlayTable)
        .values({ ...values, id, tenantId: ctx.tenantId, workspaceId })
        .onConflictDoUpdate({
          target: [salesPlayTable.tenantId, salesPlayTable.workspaceId],
          set: { ...values, deletedAt: null, updatedAt: new Date() },
        })
        .returning(),
    );
    return row;
  },

  async setSalesPlayDeleted(
    ctx: TenantContext,
    workspaceIds: string[],
    deleted: boolean,
  ): Promise<void> {
    if (workspaceIds.length === 0) return;
    await withTenant(ctx, (tx) =>
      tx
        .update(salesPlayTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(salesPlayTable.tenantId, ctx.tenantId),
            inArray(salesPlayTable.workspaceId, workspaceIds),
          ),
        ),
    );
  },

  async hardDeleteSalesPlay(ctx: TenantContext, workspaceId: string): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .delete(salesPlayTable)
        .where(
          and(
            eq(salesPlayTable.tenantId, ctx.tenantId),
            eq(salesPlayTable.workspaceId, workspaceId),
          ),
        ),
    );
  },
};
