import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { productRepo } from "@/modules/product/repo";
import { workspaceRepo } from "./repo";
import type {
  WorkspaceRow,
  MarketFitRow,
  SalesPlayRow,
} from "./schema";

/**
 * workspace domain service — business logic + validation + cross-module side
 * effects (audit) + app-level cascade. Routes stay thin: parse → call a method →
 * wrap with the {ok,error} envelope.
 *
 * Owns three tables (workspace_v2, market_fit, sales_play). The `product_id`
 * soft ref is validated against the product domain through `productRepo` (read
 * only) — workspace never writes product tables. Soft-delete/restore/purge of a
 * workspace CASCADES to its 1:1 satellites (market_fit + sales_play) in the app
 * layer, since there are no DB FKs.
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo
 * scopes all reads/writes to `ctx.tenantId` inside `withTenant`.
 */

const WORKSPACE_TYPES = ["lead_gen", "partner", "offering", "retention", "custom"] as const;
const MARKET_TYPES = ["b2b", "b2c", "mix"] as const;

export interface CreateWorkspaceInput {
  name: string;
  ownerUserId?: string;
  type?: string;
  productId?: string | null;
  targetSegment?: string | null;
  status?: string;
}

export type UpdateWorkspaceInput = Partial<CreateWorkspaceInput>;

export interface MarketFitInput {
  marketType?: string;
  confidence?: number | null;
  icp?: Record<string, unknown> | null;
  segments?: string[];
  rationale?: string | null;
  source?: string | null;
}

export interface SalesPlayInput {
  name?: string | null;
  channel?: string;
  tone?: string;
  techniques?: string[];
  steps?: Record<string, unknown>[];
  config?: Record<string, unknown> | null;
  status?: string;
}

function assertType(value: string | undefined): string {
  const t = value ?? "lead_gen";
  if (!(WORKSPACE_TYPES as readonly string[]).includes(t)) {
    throw new ServiceError(
      `type harus salah satu dari: ${WORKSPACE_TYPES.join(", ")}`,
      400,
      "validation",
    );
  }
  return t;
}

export const workspaceService = {
  async list(ctx: TenantContext): Promise<WorkspaceRow[]> {
    return workspaceRepo.list(ctx);
  },

  async listTrashed(ctx: TenantContext): Promise<WorkspaceRow[]> {
    return workspaceRepo.listTrashed(ctx);
  },

  async get(ctx: TenantContext, id: string): Promise<WorkspaceRow> {
    const row = await workspaceRepo.get(ctx, id);
    if (!row) throw new ServiceError("Workspace tidak ditemukan", 404, "not_found");
    return row;
  },

  /**
   * Create a workspace (1 ws = 1 product). If `productId` is given it must
   * reference a live product in the same tenant (integrity enforced here, no FK).
   * `ownerUserId` defaults to the acting user (the rep owns the workspace).
   */
  async create(ctx: TenantContext, input: CreateWorkspaceInput): Promise<WorkspaceRow> {
    const name = input.name?.trim();
    if (!name) throw new ServiceError("Nama workspace wajib diisi", 400, "validation");
    const type = assertType(input.type);
    const ownerUserId = input.ownerUserId?.trim() || ctx.userId;

    if (input.productId) {
      const product = await productRepo.get(ctx, input.productId);
      if (!product) throw new ServiceError("Produk tidak ditemukan", 400, "invalid_product");
    }

    const row = await workspaceRepo.insert(ctx, {
      id: "wsp_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      ownerUserId,
      name,
      type,
      productId: input.productId ?? null,
      targetSegment: input.targetSegment ?? null,
      status: input.status ?? "active",
    });

    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "workspace.create",
      targetType: "workspace",
      targetId: row.id,
      meta: { name, type, productId: input.productId ?? null },
    });
    return row;
  },

  async update(ctx: TenantContext, id: string, input: UpdateWorkspaceInput): Promise<WorkspaceRow> {
    await this.get(ctx, id); // 404s if missing/deleted

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new ServiceError("Nama workspace wajib diisi", 400, "validation");
      patch.name = name;
    }
    if (input.type !== undefined) patch.type = assertType(input.type);
    if (input.ownerUserId !== undefined) patch.ownerUserId = input.ownerUserId;
    if (input.targetSegment !== undefined) patch.targetSegment = input.targetSegment;
    if (input.status !== undefined) patch.status = input.status;
    if (input.productId !== undefined) {
      if (input.productId) {
        const product = await productRepo.get(ctx, input.productId);
        if (!product) throw new ServiceError("Produk tidak ditemukan", 400, "invalid_product");
      }
      patch.productId = input.productId;
    }

    const row = await workspaceRepo.update(ctx, id, patch);
    if (!row) throw new ServiceError("Workspace tidak ditemukan", 404, "not_found");

    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "workspace.update",
      targetType: "workspace",
      targetId: id,
      meta: { fields: Object.keys(patch) },
    });
    return row;
  },

  // ── market_fit (1:1 satellite) ───────────────────────────────────
  async getMarketFit(ctx: TenantContext, workspaceId: string): Promise<MarketFitRow | null> {
    await this.get(ctx, workspaceId);
    return (await workspaceRepo.getMarketFit(ctx, workspaceId)) ?? null;
  },

  /** Save (upsert) the workspace's market-fit result. */
  async saveMarketFit(
    ctx: TenantContext,
    workspaceId: string,
    input: MarketFitInput,
  ): Promise<MarketFitRow> {
    await this.get(ctx, workspaceId);
    const marketType = input.marketType ?? "b2b";
    if (!(MARKET_TYPES as readonly string[]).includes(marketType)) {
      throw new ServiceError("market_type harus b2b, b2c, atau mix", 400, "validation");
    }
    const row = await workspaceRepo.upsertMarketFit(ctx, workspaceId, {
      marketType,
      confidence: input.confidence ?? null,
      icp: input.icp ?? null,
      segments: input.segments ?? [],
      rationale: input.rationale ?? null,
      source: input.source ?? null,
    });
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "workspace.market_fit.save",
      targetType: "market_fit",
      targetId: row.id,
      meta: { workspaceId, marketType },
    });
    return row;
  },

  // ── sales_play (1:1 satellite) ───────────────────────────────────
  async getSalesPlay(ctx: TenantContext, workspaceId: string): Promise<SalesPlayRow | null> {
    await this.get(ctx, workspaceId);
    return (await workspaceRepo.getSalesPlay(ctx, workspaceId)) ?? null;
  },

  /** Save (upsert) the workspace's sales-play config. */
  async saveSalesPlay(
    ctx: TenantContext,
    workspaceId: string,
    input: SalesPlayInput,
  ): Promise<SalesPlayRow> {
    await this.get(ctx, workspaceId);
    const row = await workspaceRepo.upsertSalesPlay(ctx, workspaceId, {
      name: input.name ?? null,
      channel: input.channel ?? "whatsapp",
      tone: input.tone ?? "consultative",
      techniques: input.techniques ?? [],
      steps: input.steps ?? [],
      config: input.config ?? null,
      status: input.status ?? "active",
    });
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "workspace.sales_play.save",
      targetType: "sales_play",
      targetId: row.id,
      meta: { workspaceId, channel: row.channel },
    });
    return row;
  },

  // ── Soft delete + restore + purge (cascades to satellites) ───────
  async softDelete(ctx: TenantContext, id: string): Promise<void> {
    const ok = await workspaceRepo.softDelete(ctx, id);
    if (!ok) throw new ServiceError("Workspace tidak ditemukan", 404, "not_found");
    // App-level cascade: trash the 1:1 satellites alongside the parent.
    await workspaceRepo.setMarketFitDeleted(ctx, [id], true);
    await workspaceRepo.setSalesPlayDeleted(ctx, [id], true);
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "workspace.delete",
      targetType: "workspace",
      targetId: id,
    });
  },

  async restore(ctx: TenantContext, id: string): Promise<WorkspaceRow> {
    const ok = await workspaceRepo.restore(ctx, id);
    if (!ok) throw new ServiceError("Workspace tidak ada di trash", 404, "not_found");
    // App-level cascade: restore the 1:1 satellites with the parent.
    await workspaceRepo.setMarketFitDeleted(ctx, [id], false);
    await workspaceRepo.setSalesPlayDeleted(ctx, [id], false);
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "workspace.restore",
      targetType: "workspace",
      targetId: id,
    });
    return this.get(ctx, id);
  },

  /**
   * HARD delete (purge) — PERMANENTLY removes the workspace AND its satellites
   * (real SQL deletes). Irreversible. Audit stamped after (audit_log_v2 is a
   * separate FK-less table, so the trail survives the purge).
   */
  async hardDelete(ctx: TenantContext, id: string): Promise<void> {
    const ok = await workspaceRepo.hardDelete(ctx, id);
    if (!ok) throw new ServiceError("Workspace tidak ditemukan", 404, "not_found");
    await workspaceRepo.hardDeleteMarketFit(ctx, id);
    await workspaceRepo.hardDeleteSalesPlay(ctx, id);
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "workspace.purge",
      targetType: "workspace",
      targetId: id,
    });
  },
};
