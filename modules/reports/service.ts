import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { reportsRepo } from "./repo";
import type { SavedReportRow } from "./schema";

/**
 * reports / analytics domain service — read-only dashboard AGGREGATIONS over the
 * existing rebuild tables + CRUD for the thin `saved_report` config. Routes stay
 * thin: parse → call a method → wrap with the {ok,error} envelope.
 *
 * The aggregations introduce NO new heavy tables; they roll up live (non-trashed)
 * rows the CRM / inbox / sales / ecommerce / field modules already own (read-only,
 * grain = TENANT). `saved_report` is the ONLY owned table and gets the full
 * soft-delete contract (CRUD + soft/restore/purge/trashed).
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo scopes
 * all reads/writes to `ctx.tenantId` inside `withTenant`.
 */

// ── enums ────────────────────────────────────────────────────────────────────
const REPORT_KINDS = [
  "contacts_by_segment",
  "deals_by_stage",
  "pipeline_overview",
  "closing_funnel",
  "marketplace_sales",
  "field_activity",
  "overview",
] as const;
const REPORT_SCOPES = ["private", "tenant"] as const;

// ── input shapes ─────────────────────────────────────────────────────────────
export interface CreateReportInput {
  name: string;
  kind?: string;
  description?: string | null;
  config?: Record<string, unknown> | null;
  scope?: string;
  isPinned?: boolean;
  workspaceId?: string | null;
}
export type UpdateReportInput = Partial<CreateReportInput>;

// ── aggregate result shapes ───────────────────────────────────────────────────
export interface DealsByStageRow {
  stageId: string | null;
  stageName: string;
  sort: number;
  isWon: boolean;
  isLost: boolean;
  count: number;
  value: number;
}

export interface DashboardOverview {
  contactsBySegment: { segment: string; count: number }[];
  contactsByLifecycle: { stage: string; count: number }[];
  dealsByStatus: { status: string; count: number; value: number }[];
  dealsByStage: DealsByStageRow[];
  conversationsByStatus: { status: string; count: number }[];
  closingReadinessByBand: { band: string; count: number }[];
  ordersByChannel: { channel: string; count: number; total: number }[];
  visitsByStatus: { status: string; count: number }[];
  totals: {
    contacts: number;
    openDeals: number;
    openDealValue: number;
    wonDeals: number;
    wonValue: number;
    conversations: number;
    orders: number;
    orderRevenue: number;
    visits: number;
  };
}

// ── validation helpers ───────────────────────────────────────────────────────
function assertEnum(value: string | undefined, allowed: readonly string[], field: string): string {
  const v = value ?? allowed[0];
  if (!allowed.includes(v)) {
    throw new ServiceError(`${field} harus salah satu dari: ${allowed.join(", ")}`, 400, "validation");
  }
  return v;
}

/** Join grouped deal counts to their stage labels and sort by stage order. */
function composeDealsByStage(
  grouped: { stageId: string | null; count: number; value: number }[],
  stages: { id: string; name: string; sort: number; isWon: boolean; isLost: boolean }[],
): DealsByStageRow[] {
  const byId = new Map(stages.map((s) => [s.id, s]));
  return grouped
    .map((g) => {
      const stage = g.stageId ? byId.get(g.stageId) : undefined;
      return {
        stageId: g.stageId,
        stageName: stage?.name ?? "(tanpa stage)",
        sort: stage?.sort ?? 9999,
        isWon: stage?.isWon ?? false,
        isLost: stage?.isLost ?? false,
        count: g.count,
        value: g.value,
      };
    })
    .sort((a, b) => a.sort - b.sort);
}

export const reportsService = {
  // ═══════════════════════ saved_report CRUD ════════════════════════
  async listReports(
    ctx: TenantContext,
    filter?: { ownerUserId?: string; kind?: string; scope?: string },
  ): Promise<SavedReportRow[]> {
    if (filter?.kind) assertEnum(filter.kind, REPORT_KINDS, "kind");
    if (filter?.scope) assertEnum(filter.scope, REPORT_SCOPES, "scope");
    return reportsRepo.listReports(ctx, filter);
  },

  async listTrashedReports(ctx: TenantContext): Promise<SavedReportRow[]> {
    return reportsRepo.listTrashedReports(ctx);
  },

  async getReport(ctx: TenantContext, id: string): Promise<SavedReportRow> {
    const row = await reportsRepo.getReport(ctx, id);
    if (!row) throw new ServiceError("Laporan tersimpan tidak ditemukan", 404, "not_found");
    return row;
  },

  async createReport(ctx: TenantContext, input: CreateReportInput): Promise<SavedReportRow> {
    const name = input.name?.trim();
    if (!name) throw new ServiceError("Nama laporan wajib diisi", 400, "validation");
    const kind = assertEnum(input.kind, REPORT_KINDS, "kind");
    const scope = assertEnum(input.scope, REPORT_SCOPES, "scope");

    const row = await reportsRepo.insertReport(ctx, {
      id: "rpt_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      ownerUserId: ctx.userId,
      workspaceId: input.workspaceId ?? null,
      name,
      kind,
      description: input.description ?? null,
      config: input.config ?? null,
      scope,
      isPinned: input.isPinned ?? false,
    });
    await this.audit(ctx, "reports.saved.create", "saved_report", row.id, { kind });
    return row;
  },

  async updateReport(
    ctx: TenantContext,
    id: string,
    input: UpdateReportInput,
  ): Promise<SavedReportRow> {
    await this.getReport(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new ServiceError("Nama laporan wajib diisi", 400, "validation");
      patch.name = name;
    }
    if (input.kind !== undefined) patch.kind = assertEnum(input.kind, REPORT_KINDS, "kind");
    if (input.scope !== undefined) patch.scope = assertEnum(input.scope, REPORT_SCOPES, "scope");
    for (const f of ["description", "config", "isPinned", "workspaceId"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await reportsRepo.updateReport(ctx, id, patch);
    if (!row) throw new ServiceError("Laporan tersimpan tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "reports.saved.update", "saved_report", id, { fields: Object.keys(patch) });
    return row;
  },

  async softDeleteReport(ctx: TenantContext, id: string): Promise<void> {
    const ok = await reportsRepo.softDeleteReport(ctx, id);
    if (!ok) throw new ServiceError("Laporan tersimpan tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "reports.saved.delete", "saved_report", id);
  },

  async restoreReport(ctx: TenantContext, id: string): Promise<SavedReportRow> {
    const ok = await reportsRepo.restoreReport(ctx, id);
    if (!ok) throw new ServiceError("Laporan tersimpan tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "reports.saved.restore", "saved_report", id);
    return this.getReport(ctx, id);
  },

  async hardDeleteReport(ctx: TenantContext, id: string): Promise<void> {
    const ok = await reportsRepo.hardDeleteReport(ctx, id);
    if (!ok) throw new ServiceError("Laporan tersimpan tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "reports.saved.purge", "saved_report", id);
  },

  // ═══════════════════════ aggregations (read-only) ═════════════════
  async contactsBySegment(ctx: TenantContext) {
    return reportsRepo.contactsBySegment(ctx);
  },

  async dealsByStage(ctx: TenantContext): Promise<DealsByStageRow[]> {
    const [grouped, stages] = await Promise.all([
      reportsRepo.dealsByStage(ctx),
      reportsRepo.pipelineStages(ctx),
    ]);
    return composeDealsByStage(grouped, stages);
  },

  /** Closing funnel: readiness band distribution + conversation status mix. */
  async closingFunnel(ctx: TenantContext) {
    const [byBand, byStatus] = await Promise.all([
      reportsRepo.closingReadinessByBand(ctx),
      reportsRepo.conversationsByStatus(ctx),
    ]);
    return { readinessByBand: byBand, conversationsByStatus: byStatus };
  },

  /** Marketplace sales roll-up: orders by channel + by status. */
  async marketplaceSales(ctx: TenantContext) {
    const [byChannel, byStatus] = await Promise.all([
      reportsRepo.ordersByChannel(ctx),
      reportsRepo.ordersByStatus(ctx),
    ]);
    return { ordersByChannel: byChannel, ordersByStatus: byStatus };
  },

  /** Field activity roll-up: visits by status. */
  async fieldActivity(ctx: TenantContext) {
    return { visitsByStatus: await reportsRepo.visitsByStatus(ctx) };
  },

  /**
   * The one-shot dashboard OVERVIEW — composes every roll-up + headline totals.
   * Pure read; all underlying queries filter trashed rows out, scoped to the
   * tenant via `withTenant`.
   */
  async overview(ctx: TenantContext): Promise<DashboardOverview> {
    // ONE transaction for every roll-up (perf audit #15): the repo runs all 8
    // aggregates + stage labels on a single `tx`; we compose/sort/total here.
    const raw = await reportsRepo.overview(ctx);
    const {
      contactsBySegment,
      contactsByLifecycle,
      dealsByStatus,
      conversationsByStatus,
      closingReadinessByBand,
      ordersByChannel,
      visitsByStatus,
    } = raw;
    const dealsByStage = composeDealsByStage(raw.dealsByStage, raw.pipelineStages);

    const sumCount = (rows: { count: number }[]) => rows.reduce((a, r) => a + r.count, 0);
    const open = dealsByStatus.find((d) => d.status === "open");
    const won = dealsByStatus.find((d) => d.status === "won");

    return {
      contactsBySegment,
      contactsByLifecycle,
      dealsByStatus,
      dealsByStage,
      conversationsByStatus,
      closingReadinessByBand,
      ordersByChannel,
      visitsByStatus,
      totals: {
        contacts: sumCount(contactsBySegment),
        openDeals: open?.count ?? 0,
        openDealValue: open?.value ?? 0,
        wonDeals: won?.count ?? 0,
        wonValue: won?.value ?? 0,
        conversations: sumCount(conversationsByStatus),
        orders: ordersByChannel.reduce((a, r) => a + r.count, 0),
        orderRevenue: ordersByChannel.reduce((a, r) => a + r.total, 0),
        visits: sumCount(visitsByStatus),
      },
    };
  },

  // ═══════════════════════ internal helpers ═════════════════════════
  /** Write a tenant-scoped audit row for a reports mutation. */
  async audit(
    ctx: TenantContext,
    action: string,
    targetType: string,
    targetId: string | null,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action,
      targetType,
      targetId,
      meta: meta ?? null,
    });
  },
};
