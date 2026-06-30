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
  //
  // Each public method wraps ONE query-builder in its own `withTenant`. The
  // builders are the bare `tx` queries (no transaction of their own) so the
  // read-hot `overview` can run ALL of them inside a SINGLE `withTenant`
  // (one BEGIN + 3×set_config + COMMIT) instead of one transaction per aggregate
  // (perf audit #15).

  /** Live contacts grouped by `segment` (b2c|b2b|unknown). */
  async contactsBySegment(ctx: TenantContext): Promise<{ segment: string; count: number }[]> {
    return withTenant(ctx, (tx) => contactsBySegmentQ(tx, ctx.tenantId));
  },

  /** Live contacts grouped by `lifecycle_stage` (lead|mql|sql|customer|churned). */
  async contactsByLifecycle(ctx: TenantContext): Promise<{ stage: string; count: number }[]> {
    return withTenant(ctx, (tx) => contactsByLifecycleQ(tx, ctx.tenantId));
  },

  /** Live deals grouped by `stage_id`, with count + summed value (open deals). */
  async dealsByStage(
    ctx: TenantContext,
  ): Promise<{ stageId: string | null; count: number; value: number }[]> {
    return withTenant(ctx, (tx) => dealsByStageQ(tx, ctx.tenantId));
  },

  /** Live deals grouped by `status` (open|won|lost), count + summed value. */
  async dealsByStatus(
    ctx: TenantContext,
  ): Promise<{ status: string; count: number; value: number }[]> {
    return withTenant(ctx, (tx) => dealsByStatusQ(tx, ctx.tenantId));
  },

  /** The tenant's pipeline stages (for labeling the deals-by-stage roll-up). */
  async pipelineStages(
    ctx: TenantContext,
  ): Promise<{ id: string; name: string; sort: number; isWon: boolean; isLost: boolean }[]> {
    return withTenant(ctx, (tx) => pipelineStagesQ(tx, ctx.tenantId));
  },

  /** Live conversations grouped by `status` (open|snoozed|closed). */
  async conversationsByStatus(ctx: TenantContext): Promise<{ status: string; count: number }[]> {
    return withTenant(ctx, (tx) => conversationsByStatusQ(tx, ctx.tenantId));
  },

  /** Closing-readiness rows grouped by `band` (cold|warm|hot). */
  async closingReadinessByBand(ctx: TenantContext): Promise<{ band: string; count: number }[]> {
    return withTenant(ctx, (tx) => closingReadinessByBandQ(tx, ctx.tenantId));
  },

  /** Marketplace orders grouped by `channel`, count + summed total. */
  async ordersByChannel(
    ctx: TenantContext,
  ): Promise<{ channel: string; count: number; total: number }[]> {
    return withTenant(ctx, (tx) => ordersByChannelQ(tx, ctx.tenantId));
  },

  /** Marketplace orders grouped by `status`. */
  async ordersByStatus(
    ctx: TenantContext,
  ): Promise<{ status: string; count: number; total: number }[]> {
    return withTenant(ctx, (tx) => ordersByStatusQ(tx, ctx.tenantId));
  },

  /** Field visits grouped by `status` (planned|in_progress|completed|…). */
  async visitsByStatus(ctx: TenantContext): Promise<{ status: string; count: number }[]> {
    return withTenant(ctx, (tx) => visitsByStatusQ(tx, ctx.tenantId));
  },

  /**
   * The dashboard OVERVIEW roll-ups in ONE transaction. Runs all 8 aggregates +
   * the pipeline-stage labels concurrently on a single `tx` (`Promise.all`), so
   * the read-hot dashboard pays the BEGIN/set_config/COMMIT tax once, not 9×.
   * The service composes/sorts/totals the raw result.
   */
  async overview(ctx: TenantContext): Promise<OverviewRaw> {
    return withTenant(ctx, async (tx) => {
      const t = ctx.tenantId;
      const [
        contactsBySegment,
        contactsByLifecycle,
        dealsByStage,
        dealsByStatus,
        pipelineStages,
        conversationsByStatus,
        closingReadinessByBand,
        ordersByChannel,
        visitsByStatus,
      ] = await Promise.all([
        contactsBySegmentQ(tx, t),
        contactsByLifecycleQ(tx, t),
        dealsByStageQ(tx, t),
        dealsByStatusQ(tx, t),
        pipelineStagesQ(tx, t),
        conversationsByStatusQ(tx, t),
        closingReadinessByBandQ(tx, t),
        ordersByChannelQ(tx, t),
        visitsByStatusQ(tx, t),
      ]);
      return {
        contactsBySegment,
        contactsByLifecycle,
        dealsByStage,
        dealsByStatus,
        pipelineStages,
        conversationsByStatus,
        closingReadinessByBand,
        ordersByChannel,
        visitsByStatus,
      };
    });
  },
};

// ── query builders (operate on an open `tx`; no transaction of their own) ─────
type TxArg = Parameters<Parameters<typeof withTenant>[1]>[0];

/** Raw, un-composed roll-ups returned by `reportsRepo.overview` (one txn). */
export interface OverviewRaw {
  contactsBySegment: { segment: string; count: number }[];
  contactsByLifecycle: { stage: string; count: number }[];
  dealsByStage: { stageId: string | null; count: number; value: number }[];
  dealsByStatus: { status: string; count: number; value: number }[];
  pipelineStages: { id: string; name: string; sort: number; isWon: boolean; isLost: boolean }[];
  conversationsByStatus: { status: string; count: number }[];
  closingReadinessByBand: { band: string; count: number }[];
  ordersByChannel: { channel: string; count: number; total: number }[];
  visitsByStatus: { status: string; count: number }[];
}

async function contactsBySegmentQ(
  tx: TxArg,
  tenantId: string,
): Promise<{ segment: string; count: number }[]> {
  const rows = await tx
    .select({ segment: contactTable.segment, n: count() })
    .from(contactTable)
    .where(and(eq(contactTable.tenantId, tenantId), isNull(contactTable.deletedAt)))
    .groupBy(contactTable.segment);
  return rows.map((r) => ({ segment: r.segment, count: Number(r.n) }));
}

async function contactsByLifecycleQ(
  tx: TxArg,
  tenantId: string,
): Promise<{ stage: string; count: number }[]> {
  const rows = await tx
    .select({ stage: contactTable.lifecycleStage, n: count() })
    .from(contactTable)
    .where(and(eq(contactTable.tenantId, tenantId), isNull(contactTable.deletedAt)))
    .groupBy(contactTable.lifecycleStage);
  return rows.map((r) => ({ stage: r.stage, count: Number(r.n) }));
}

async function dealsByStageQ(
  tx: TxArg,
  tenantId: string,
): Promise<{ stageId: string | null; count: number; value: number }[]> {
  const rows = await tx
    .select({ stageId: dealTable.stageId, n: count(), v: sum(dealTable.value) })
    .from(dealTable)
    .where(and(eq(dealTable.tenantId, tenantId), isNull(dealTable.deletedAt)))
    .groupBy(dealTable.stageId);
  return rows.map((r) => ({ stageId: r.stageId, count: Number(r.n), value: Number(r.v ?? 0) }));
}

async function dealsByStatusQ(
  tx: TxArg,
  tenantId: string,
): Promise<{ status: string; count: number; value: number }[]> {
  const rows = await tx
    .select({ status: dealTable.status, n: count(), v: sum(dealTable.value) })
    .from(dealTable)
    .where(and(eq(dealTable.tenantId, tenantId), isNull(dealTable.deletedAt)))
    .groupBy(dealTable.status);
  return rows.map((r) => ({ status: r.status, count: Number(r.n), value: Number(r.v ?? 0) }));
}

async function pipelineStagesQ(
  tx: TxArg,
  tenantId: string,
): Promise<{ id: string; name: string; sort: number; isWon: boolean; isLost: boolean }[]> {
  return tx
    .select({
      id: pipelineStageTable.id,
      name: pipelineStageTable.name,
      sort: pipelineStageTable.sort,
      isWon: pipelineStageTable.isWon,
      isLost: pipelineStageTable.isLost,
    })
    .from(pipelineStageTable)
    .where(and(eq(pipelineStageTable.tenantId, tenantId), isNull(pipelineStageTable.deletedAt)));
}

async function conversationsByStatusQ(
  tx: TxArg,
  tenantId: string,
): Promise<{ status: string; count: number }[]> {
  const rows = await tx
    .select({ status: conversationTable.status, n: count() })
    .from(conversationTable)
    .where(and(eq(conversationTable.tenantId, tenantId), isNull(conversationTable.deletedAt)))
    .groupBy(conversationTable.status);
  return rows.map((r) => ({ status: r.status, count: Number(r.n) }));
}

async function closingReadinessByBandQ(
  tx: TxArg,
  tenantId: string,
): Promise<{ band: string; count: number }[]> {
  const rows = await tx
    .select({ band: closingReadinessTable.band, n: count() })
    .from(closingReadinessTable)
    .where(
      and(eq(closingReadinessTable.tenantId, tenantId), isNull(closingReadinessTable.deletedAt)),
    )
    .groupBy(closingReadinessTable.band);
  return rows.map((r) => ({ band: r.band, count: Number(r.n) }));
}

async function ordersByChannelQ(
  tx: TxArg,
  tenantId: string,
): Promise<{ channel: string; count: number; total: number }[]> {
  const rows = await tx
    .select({ channel: marketplaceOrderTable.channel, n: count(), v: sum(marketplaceOrderTable.total) })
    .from(marketplaceOrderTable)
    .where(
      and(eq(marketplaceOrderTable.tenantId, tenantId), isNull(marketplaceOrderTable.deletedAt)),
    )
    .groupBy(marketplaceOrderTable.channel);
  return rows.map((r) => ({ channel: r.channel, count: Number(r.n), total: Number(r.v ?? 0) }));
}

async function ordersByStatusQ(
  tx: TxArg,
  tenantId: string,
): Promise<{ status: string; count: number; total: number }[]> {
  const rows = await tx
    .select({ status: marketplaceOrderTable.status, n: count(), v: sum(marketplaceOrderTable.total) })
    .from(marketplaceOrderTable)
    .where(
      and(eq(marketplaceOrderTable.tenantId, tenantId), isNull(marketplaceOrderTable.deletedAt)),
    )
    .groupBy(marketplaceOrderTable.status);
  return rows.map((r) => ({ status: r.status, count: Number(r.n), total: Number(r.v ?? 0) }));
}

async function visitsByStatusQ(
  tx: TxArg,
  tenantId: string,
): Promise<{ status: string; count: number }[]> {
  const rows = await tx
    .select({ status: fieldVisitTable.status, n: count() })
    .from(fieldVisitTable)
    .where(and(eq(fieldVisitTable.tenantId, tenantId), isNull(fieldVisitTable.deletedAt)))
    .groupBy(fieldVisitTable.status);
  return rows.map((r) => ({ status: r.status, count: Number(r.n) }));
}
