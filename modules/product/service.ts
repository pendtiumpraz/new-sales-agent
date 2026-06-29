import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { productRepo } from "./repo";
import type { ProductRow } from "./schema";

/**
 * product domain service — business logic + validation + cross-module side
 * effects (audit). Routes stay thin: parse → call a method → wrap with the
 * {ok,error} envelope. Referential integrity / cascade is enforced HERE (app
 * layer), never via DB FKs (none exist).
 *
 * Grain = TENANT: every method takes the caller's `TenantContext` and the repo
 * scopes reads/writes to `ctx.tenantId` inside `withTenant`.
 */

const TARGET_MARKETS = ["B2B", "B2C", "both"] as const;
export type TargetMarket = (typeof TARGET_MARKETS)[number];

export interface CreateProductInput {
  name: string;
  category?: string | null;
  valueProps?: string[];
  pricingNotes?: string | null;
  targetMarket?: string | null;
  icp?: Record<string, unknown> | null;
  status?: string;
}

export type UpdateProductInput = Partial<CreateProductInput>;

function normalizeMarket(value?: string | null): string | null {
  if (value == null) return null;
  const found = TARGET_MARKETS.find((m) => m.toLowerCase() === value.trim().toLowerCase());
  if (!found) throw new ServiceError("target_market harus B2B, B2C, atau both", 400, "validation");
  return found;
}

export const productService = {
  async list(ctx: TenantContext): Promise<ProductRow[]> {
    return productRepo.list(ctx);
  },

  async listTrashed(ctx: TenantContext): Promise<ProductRow[]> {
    return productRepo.listTrashed(ctx);
  },

  async get(ctx: TenantContext, id: string): Promise<ProductRow> {
    const row = await productRepo.get(ctx, id);
    if (!row) throw new ServiceError("Produk tidak ditemukan", 404, "not_found");
    return row;
  },

  async create(ctx: TenantContext, input: CreateProductInput): Promise<ProductRow> {
    const name = input.name?.trim();
    if (!name) throw new ServiceError("Nama produk wajib diisi", 400, "validation");
    const targetMarket = normalizeMarket(input.targetMarket);

    const row = await productRepo.insert(ctx, {
      id: "prd_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      name,
      category: input.category ?? null,
      valueProps: input.valueProps ?? [],
      pricingNotes: input.pricingNotes ?? null,
      targetMarket,
      icp: input.icp ?? null,
      status: input.status ?? "active",
    });

    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "product.create",
      targetType: "product",
      targetId: row.id,
      meta: { name, targetMarket },
    });
    return row;
  },

  async update(ctx: TenantContext, id: string, input: UpdateProductInput): Promise<ProductRow> {
    await this.get(ctx, id); // 404s if missing/deleted

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new ServiceError("Nama produk wajib diisi", 400, "validation");
      patch.name = name;
    }
    if (input.category !== undefined) patch.category = input.category;
    if (input.valueProps !== undefined) patch.valueProps = input.valueProps;
    if (input.pricingNotes !== undefined) patch.pricingNotes = input.pricingNotes;
    if (input.targetMarket !== undefined) patch.targetMarket = normalizeMarket(input.targetMarket);
    if (input.icp !== undefined) patch.icp = input.icp;
    if (input.status !== undefined) patch.status = input.status;

    const row = await productRepo.update(ctx, id, patch);
    if (!row) throw new ServiceError("Produk tidak ditemukan", 404, "not_found");

    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "product.update",
      targetType: "product",
      targetId: id,
      meta: { fields: Object.keys(patch) },
    });
    return row;
  },

  // ── Soft delete + restore + purge ────────────────────────────────
  async softDelete(ctx: TenantContext, id: string): Promise<void> {
    const ok = await productRepo.softDelete(ctx, id);
    if (!ok) throw new ServiceError("Produk tidak ditemukan", 404, "not_found");
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "product.delete",
      targetType: "product",
      targetId: id,
    });
  },

  async restore(ctx: TenantContext, id: string): Promise<ProductRow> {
    const ok = await productRepo.restore(ctx, id);
    if (!ok) throw new ServiceError("Produk tidak ada di trash", 404, "not_found");
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "product.restore",
      targetType: "product",
      targetId: id,
    });
    return this.get(ctx, id);
  },

  /**
   * HARD delete (purge) — PERMANENTLY removes the product row (real SQL delete).
   * Irreversible. Audit is stamped AFTER the delete (audit_log_v2 is a separate
   * FK-less table, so the trail survives the purge).
   */
  async hardDelete(ctx: TenantContext, id: string): Promise<void> {
    const ok = await productRepo.hardDelete(ctx, id);
    if (!ok) throw new ServiceError("Produk tidak ditemukan", 404, "not_found");
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "product.purge",
      targetType: "product",
      targetId: id,
    });
  },
};
