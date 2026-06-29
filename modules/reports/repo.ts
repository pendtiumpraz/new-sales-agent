import { and, desc, eq, isNotNull, isNull, count, sum } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { contactTable, dealTable, pipelineStageTable } from "@/modules/crm/schema";
import { conversationTable } from "@/modules/inbox/schema";
import { closingReadinessTable } from "@/modules/sales/schema";
import { marketplaceOrderTable } from "@/modules/ecommerce/schema";
import { fieldVisitTable } from "@/modules/field/schema";
import {
  savedReportTable,
  type SavedReportRow,
  type SavedReportInsert,
} from "./schema";

/**
 * reports repo — owns the thin `saved_report` config table AND hosts the read-only
 * AGGREGATION queries the analytics service composes. Per the modular-monolith
 * rule a module owns its own tables; the aggregation here reads OTHER modules'
 * tables ONLY for read-only roll-ups that feed dashboards (no writes, no business
 * logic) — the equivalent of a reporting/BI view. Every read is wrapped in
 * `withTenant` and filtered by `tenant_id`.
 *
 * `saved_report` follows the standard soft-delete contract (list/get/insert/update
 * + soft/restore/hard + trashed).
 */
export const reportsRepo = {
  // ═══════════════════════ saved_report (owned) ═════════════════════
  async listReports(
    ctx: TenantContext,
    filter?: { ownerUserId?: string; kind?: string; scope?: string },
  ): Promise<SavedReportRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(savedReportTable)
        .where(
          and(
            eq(savedReportTable.tenantId, ctx.tenantId),
            isNull(savedReportTable.deletedAt),
            filter?.ownerUserId ? eq(savedReportTable.ownerUserId, filter.ownerUserId) : undefined,
            filter?.kind ? eq(savedReportTable.kind, filter.kind) : undefined,
            filter?.scope ? eq(savedReportTable.scope, filter.scope) : undefined,
          ),
        )
        .orderBy(desc(savedReportTable.updatedAt)),
    );
  },

  async listTrashedReports(ctx: TenantContext): Promise<SavedReportRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(savedReportTable)
        .where(and(eq(savedReportTable.tenantId, ctx.tenantId), isNotNull(savedReportTable.deletedAt)))
        .orderBy(desc(savedReportTable.deletedAt)),
    );
  },

  async getReport(ctx: TenantContext, id: string): Promise<SavedReportRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(savedReportTable)
        .where(
          and(
            eq(savedReportTable.tenantId, ctx.tenantId),
            eq(savedReportTable.id, id),
            isNull(savedReportTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertReport(ctx: TenantContext, values: SavedReportInsert): Promise<SavedReportRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(savedReportTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateReport(
    ctx: TenantContext,
    id: string,
    patch: Partial<SavedReportInsert>,
  ): Promise<SavedReportRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(savedReportTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(savedReportTable.tenantId, ctx.tenantId),
            eq(savedReportTable.id, id),
            isNull(savedReportTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteReport(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(savedReportTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(savedReportTable.tenantId, ctx.tenantId),
            eq(savedReportTable.id, id),
            isNull(savedReportTable.deletedAt),
          ),
        )
        .returning({ id: savedReportTable.id }),
    );
    return rows.length > 0;
  },

  async restoreReport(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(savedReportTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(savedReportTable.tenantId, ctx.tenantId),
            eq(savedReportTable.id, id),
            isNotNull(savedReportTable.deletedAt),
          ),
        )
        .returning({ id: savedReportTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteReport(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(savedReportTable)
        .where(and(eq(savedReportTable.tenantId, ctx.tenantId), eq(savedReportTable.id, id)))
        .returning({ id: savedReportTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ aggregations (read-only) ═════════════════
  // These read OTHER modules' tables for roll-ups only (no writes). All filter
  // `deleted_at IS NULL` so trashed rows never skew a dashboard.

  /** Live contacts grouped by `segment` (b2c|b2b|unknown). */
  async contactsBySegment(
    ctx: TenantContext,
  ): Promise<{ segment: string; count: number }[]> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({ segment: contactTable.segment, n: count() })
        .from(contactTable)
        .where(and(eq(contactTable.tenantId, ctx.tenantId), isNull(contactTable.deletedAt)))
        .groupBy(contactTable.segment),
    );
    return rows.map((r) => ({ segment: r.segment, count: Number(r.n) }));
  },

  /** Live contacts grouped by `lifecycle_stage` (lead|mql|sql|customer|churned). */
  async contactsByLifecycle(
    ctx: TenantContext,
  ): Promise<{ stage: string; count: number }[]> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({ stage: contactTable.lifecycleStage, n: count() })
        .from(contactTable)
        .where(and(eq(contactTable.tenantId, ctx.tenantId), isNull(contactTable.deletedAt)))
        .groupBy(contactTable.lifecycleStage),
    );
    return rows.map((r) => ({ stage: r.stage, count: Number(r.n) }));
  },

  /** Live deals grouped by `stage_id`, with count + summed value (open deals). */
  async dealsByStage(
    ctx: TenantContext,
  ): Promise<{ stageId: string | null; count: number; value: number }[]> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({ stageId: dealTable.stageId, n: count(), v: sum(dealTable.value) })
        .from(dealTable)
        .where(and(eq(dealTable.tenantId, ctx.tenantId), isNull(dealTable.deletedAt)))
        .groupBy(dealTable.stageId),
    );
    return rows.map((r) => ({
      stageId: r.stageId,
      count: Number(r.n),
      value: Number(r.v ?? 0),
    }));
  },

  /** Live deals grouped by `status` (open|won|lost), count + summed value. */
  async dealsByStatus(
    ctx: TenantContext,
  ): Promise<{ status: string; count: number; value: number }[]> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({ status: dealTable.status, n: count(), v: sum(dealTable.value) })
        .from(dealTable)
        .where(and(eq(dealTable.tenantId, ctx.tenantId), isNull(dealTable.deletedAt)))
        .groupBy(dealTable.status),
    );
    return rows.map((r) => ({ status: r.status, count: Number(r.n), value: Number(r.v ?? 0) }));
  },

  /** The tenant's pipeline stages (for labeling the deals-by-stage roll-up). */
  async pipelineStages(
    ctx: TenantContext,
  ): Promise<{ id: string; name: string; sort: number; isWon: boolean; isLost: boolean }[]> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({
          id: pipelineStageTable.id,
          name: pipelineStageTable.name,
          sort: pipelineStageTable.sort,
          isWon: pipelineStageTable.isWon,
          isLost: pipelineStageTable.isLost,
        })
        .from(pipelineStageTable)
        .where(
          and(eq(pipelineStageTable.tenantId, ctx.tenantId), isNull(pipelineStageTable.deletedAt)),
        ),
    );
    return rows;
  },

  /** Live conversations grouped by `status` (open|snoozed|closed). */
  async conversationsByStatus(
    ctx: TenantContext,
  ): Promise<{ status: string; count: number }[]> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({ status: conversationTable.status, n: count() })
        .from(conversationTable)
        .where(
          and(eq(conversationTable.tenantId, ctx.tenantId), isNull(conversationTable.deletedAt)),
        )
        .groupBy(conversationTable.status),
    );
    return rows.map((r) => ({ status: r.status, count: Number(r.n) }));
  },

  /** Closing-readiness rows grouped by `band` (cold|warm|hot). */
  async closingReadinessByBand(
    ctx: TenantContext,
  ): Promise<{ band: string; count: number }[]> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({ band: closingReadinessTable.band, n: count() })
        .from(closingReadinessTable)
        .where(
          and(
            eq(closingReadinessTable.tenantId, ctx.tenantId),
            isNull(closingReadinessTable.deletedAt),
          ),
        )
        .groupBy(closingReadinessTable.band),
    );
    return rows.map((r) => ({ band: r.band, count: Number(r.n) }));
  },

  /** Marketplace orders grouped by `channel`, count + summed total. */
  async ordersByChannel(
    ctx: TenantContext,
  ): Promise<{ channel: string; count: number; total: number }[]> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({ channel: marketplaceOrderTable.channel, n: count(), v: sum(marketplaceOrderTable.total) })
        .from(marketplaceOrderTable)
        .where(
          and(
            eq(marketplaceOrderTable.tenantId, ctx.tenantId),
            isNull(marketplaceOrderTable.deletedAt),
          ),
        )
        .groupBy(marketplaceOrderTable.channel),
    );
    return rows.map((r) => ({ channel: r.channel, count: Number(r.n), total: Number(r.v ?? 0) }));
  },

  /** Marketplace orders grouped by `status`. */
  async ordersByStatus(
    ctx: TenantContext,
  ): Promise<{ status: string; count: number; total: number }[]> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({ status: marketplaceOrderTable.status, n: count(), v: sum(marketplaceOrderTable.total) })
        .from(marketplaceOrderTable)
        .where(
          and(
            eq(marketplaceOrderTable.tenantId, ctx.tenantId),
            isNull(marketplaceOrderTable.deletedAt),
          ),
        )
        .groupBy(marketplaceOrderTable.status),
    );
    return rows.map((r) => ({ status: r.status, count: Number(r.n), total: Number(r.v ?? 0) }));
  },

  /** Field visits grouped by `status` (planned|in_progress|completed|…). */
  async visitsByStatus(
    ctx: TenantContext,
  ): Promise<{ status: string; count: number }[]> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({ status: fieldVisitTable.status, n: count() })
        .from(fieldVisitTable)
        .where(and(eq(fieldVisitTable.tenantId, ctx.tenantId), isNull(fieldVisitTable.deletedAt)))
        .groupBy(fieldVisitTable.status),
    );
    return rows.map((r) => ({ status: r.status, count: Number(r.n) }));
  },
};
