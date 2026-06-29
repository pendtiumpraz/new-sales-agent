import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { marketplaceRepo } from "./repo";
import type { MarketplaceIntegrationRow, MarketplaceListingRow } from "./schema";

/**
 * marketplace domain service — lead-source integrations + their product listings
 * business logic + validation + cross-module side effects (audit) + app-level
 * cascade. Routes stay thin: parse → call a method → wrap with the {ok,error}
 * envelope.
 *
 * Owns two tables (marketplace_integration, marketplace_listing_v2). Referential
 * integrity is enforced HERE (app layer), never via DB FKs (none exist): a
 * listing's `integration_id` is validated against a live integration in THIS
 * module before write. Soft-delete/restore/purge of an integration CASCADES to its
 * listings in the app layer.
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo scopes
 * all reads/writes to `ctx.tenantId` inside `withTenant`.
 */

// ── enums ────────────────────────────────────────────────────────────────────
const CHANNELS = ["tokopedia", "shopee", "tiktok", "lazada", "other"] as const;
const INTEGRATION_STATUSES = ["connected", "pending", "disconnected", "error"] as const;
const LISTING_STATUSES = ["draft", "active", "paused", "out_of_stock", "removed"] as const;

// ── input shapes ─────────────────────────────────────────────────────────────
export interface CreateIntegrationInput {
  storeName: string;
  channel?: string;
  storeId?: string | null;
  status?: string;
  config?: Record<string, unknown> | null;
  workspaceId?: string | null;
}
export type UpdateIntegrationInput = Partial<CreateIntegrationInput>;

export interface CreateListingInput {
  integrationId: string;
  title: string;
  productId?: string | null;
  externalId?: string | null;
  url?: string | null;
  price?: number;
  currency?: string;
  stock?: number;
  status?: string;
  workspaceId?: string | null;
  meta?: Record<string, unknown> | null;
}
export type UpdateListingInput = Partial<Omit<CreateListingInput, "integrationId">>;

// ── validation helpers ───────────────────────────────────────────────────────
function assertEnum(value: string | undefined, allowed: readonly string[], field: string): string {
  const v = value ?? allowed[0];
  if (!allowed.includes(v)) {
    throw new ServiceError(`${field} harus salah satu dari: ${allowed.join(", ")}`, 400, "validation");
  }
  return v;
}

export const marketplaceService = {
  // ═══════════════════════ marketplace_integration ══════════════════
  async listIntegrations(
    ctx: TenantContext,
    filter?: { channel?: string; status?: string; workspaceId?: string },
  ): Promise<MarketplaceIntegrationRow[]> {
    if (filter?.channel) assertEnum(filter.channel, CHANNELS, "channel");
    if (filter?.status) assertEnum(filter.status, INTEGRATION_STATUSES, "status");
    return marketplaceRepo.listIntegrations(ctx, filter);
  },

  async listTrashedIntegrations(ctx: TenantContext): Promise<MarketplaceIntegrationRow[]> {
    return marketplaceRepo.listTrashedIntegrations(ctx);
  },

  async getIntegration(ctx: TenantContext, id: string): Promise<MarketplaceIntegrationRow> {
    const row = await marketplaceRepo.getIntegration(ctx, id);
    if (!row) throw new ServiceError("Integrasi marketplace tidak ditemukan", 404, "not_found");
    return row;
  },

  async createIntegration(
    ctx: TenantContext,
    input: CreateIntegrationInput,
  ): Promise<MarketplaceIntegrationRow> {
    const storeName = input.storeName?.trim();
    if (!storeName) throw new ServiceError("Nama toko wajib diisi", 400, "validation");
    const channel = assertEnum(input.channel, CHANNELS, "channel");
    const status = assertEnum(input.status, INTEGRATION_STATUSES, "status");

    const row = await marketplaceRepo.insertIntegration(ctx, {
      id: "mki_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      workspaceId: input.workspaceId ?? null,
      channel,
      storeName,
      storeId: input.storeId ?? null,
      status,
      config: input.config ?? null,
      listingCount: 0,
      connectedBy: ctx.userId,
    });
    await this.audit(ctx, "marketplace.integration.create", "marketplace_integration", row.id, {
      channel,
    });
    return row;
  },

  async updateIntegration(
    ctx: TenantContext,
    id: string,
    input: UpdateIntegrationInput,
  ): Promise<MarketplaceIntegrationRow> {
    await this.getIntegration(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.storeName !== undefined) {
      const storeName = input.storeName?.trim();
      if (!storeName) throw new ServiceError("Nama toko wajib diisi", 400, "validation");
      patch.storeName = storeName;
    }
    if (input.channel !== undefined) patch.channel = assertEnum(input.channel, CHANNELS, "channel");
    if (input.status !== undefined)
      patch.status = assertEnum(input.status, INTEGRATION_STATUSES, "status");
    for (const f of ["storeId", "config", "workspaceId"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await marketplaceRepo.updateIntegration(ctx, id, patch);
    if (!row) throw new ServiceError("Integrasi marketplace tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "marketplace.integration.update", "marketplace_integration", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  /** Mark a channel synced (stamps last_sync_at); status optional. */
  async syncIntegration(
    ctx: TenantContext,
    id: string,
    status?: string,
  ): Promise<MarketplaceIntegrationRow> {
    await this.getIntegration(ctx, id);
    const patch: Record<string, unknown> = { lastSyncAt: new Date() };
    if (status !== undefined) patch.status = assertEnum(status, INTEGRATION_STATUSES, "status");
    const row = await marketplaceRepo.updateIntegration(ctx, id, patch);
    if (!row) throw new ServiceError("Integrasi marketplace tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "marketplace.integration.sync", "marketplace_integration", id);
    return row;
  },

  async softDeleteIntegration(ctx: TenantContext, id: string): Promise<void> {
    const ok = await marketplaceRepo.softDeleteIntegration(ctx, id);
    if (!ok) throw new ServiceError("Integrasi marketplace tidak ditemukan", 404, "not_found");
    await marketplaceRepo.setListingsDeletedByIntegration(ctx, id, true);
    await this.audit(ctx, "marketplace.integration.delete", "marketplace_integration", id);
  },

  async restoreIntegration(ctx: TenantContext, id: string): Promise<MarketplaceIntegrationRow> {
    const ok = await marketplaceRepo.restoreIntegration(ctx, id);
    if (!ok) throw new ServiceError("Integrasi marketplace tidak ada di trash", 404, "not_found");
    await marketplaceRepo.setListingsDeletedByIntegration(ctx, id, false);
    await this.audit(ctx, "marketplace.integration.restore", "marketplace_integration", id);
    return this.getIntegration(ctx, id);
  },

  async hardDeleteIntegration(ctx: TenantContext, id: string): Promise<void> {
    const ok = await marketplaceRepo.hardDeleteIntegration(ctx, id);
    if (!ok) throw new ServiceError("Integrasi marketplace tidak ditemukan", 404, "not_found");
    await marketplaceRepo.hardDeleteListingsByIntegration(ctx, id);
    await this.audit(ctx, "marketplace.integration.purge", "marketplace_integration", id);
  },

  // ═══════════════════════ marketplace_listing_v2 ═══════════════════
  async listListings(
    ctx: TenantContext,
    filter?: { integrationId?: string; productId?: string; channel?: string; status?: string },
  ): Promise<MarketplaceListingRow[]> {
    if (filter?.channel) assertEnum(filter.channel, CHANNELS, "channel");
    if (filter?.status) assertEnum(filter.status, LISTING_STATUSES, "status");
    return marketplaceRepo.listListings(ctx, filter);
  },

  async listTrashedListings(ctx: TenantContext): Promise<MarketplaceListingRow[]> {
    return marketplaceRepo.listTrashedListings(ctx);
  },

  async getListing(ctx: TenantContext, id: string): Promise<MarketplaceListingRow> {
    const row = await marketplaceRepo.getListing(ctx, id);
    if (!row) throw new ServiceError("Listing marketplace tidak ditemukan", 404, "not_found");
    return row;
  },

  async createListing(ctx: TenantContext, input: CreateListingInput): Promise<MarketplaceListingRow> {
    const integrationId = input.integrationId?.trim();
    if (!integrationId) throw new ServiceError("integration_id wajib diisi", 400, "validation");
    const title = input.title?.trim();
    if (!title) throw new ServiceError("Judul listing wajib diisi", 400, "validation");
    // Integrity: a listing must belong to a live integration in this tenant.
    const integration = await this.getIntegration(ctx, integrationId);
    const status = assertEnum(input.status, LISTING_STATUSES, "status");

    const row = await marketplaceRepo.insertListing(ctx, {
      id: "mkl_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      integrationId,
      workspaceId: input.workspaceId ?? integration.workspaceId ?? null,
      productId: input.productId ?? null,
      channel: integration.channel,
      externalId: input.externalId ?? null,
      title,
      url: input.url ?? null,
      price: input.price ?? 0,
      currency: input.currency ?? "IDR",
      stock: Math.max(0, Math.trunc(input.stock ?? 0)),
      status,
      views: 0,
      leads: 0,
      meta: input.meta ?? null,
    });
    await this.syncListingCount(ctx, integrationId);
    await this.audit(ctx, "marketplace.listing.create", "marketplace_listing", row.id, {
      integrationId,
    });
    return row;
  },

  async updateListing(
    ctx: TenantContext,
    id: string,
    input: UpdateListingInput,
  ): Promise<MarketplaceListingRow> {
    await this.getListing(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) {
      const title = input.title?.trim();
      if (!title) throw new ServiceError("Judul listing wajib diisi", 400, "validation");
      patch.title = title;
    }
    if (input.status !== undefined)
      patch.status = assertEnum(input.status, LISTING_STATUSES, "status");
    if (input.stock !== undefined) patch.stock = Math.max(0, Math.trunc(input.stock));
    for (const f of ["productId", "externalId", "url", "price", "currency", "workspaceId", "meta"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await marketplaceRepo.updateListing(ctx, id, patch);
    if (!row) throw new ServiceError("Listing marketplace tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "marketplace.listing.update", "marketplace_listing", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  /** Record engagement on a listing (a lead-source signal): bump views/leads. */
  async trackListing(
    ctx: TenantContext,
    id: string,
    delta: { views?: number; leads?: number },
  ): Promise<MarketplaceListingRow> {
    const listing = await this.getListing(ctx, id);
    const patch: Record<string, unknown> = {};
    if (delta.views !== undefined) patch.views = Math.max(0, listing.views + Math.trunc(delta.views));
    if (delta.leads !== undefined) patch.leads = Math.max(0, listing.leads + Math.trunc(delta.leads));
    if (Object.keys(patch).length === 0) return listing;
    const row = await marketplaceRepo.updateListing(ctx, id, patch);
    if (!row) throw new ServiceError("Listing marketplace tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "marketplace.listing.track", "marketplace_listing", id, delta);
    return row;
  },

  async softDeleteListing(ctx: TenantContext, id: string): Promise<void> {
    const listing = await marketplaceRepo.getListing(ctx, id);
    const ok = await marketplaceRepo.softDeleteListing(ctx, id);
    if (!ok) throw new ServiceError("Listing marketplace tidak ditemukan", 404, "not_found");
    if (listing) await this.syncListingCount(ctx, listing.integrationId);
    await this.audit(ctx, "marketplace.listing.delete", "marketplace_listing", id);
  },

  async restoreListing(ctx: TenantContext, id: string): Promise<MarketplaceListingRow> {
    const ok = await marketplaceRepo.restoreListing(ctx, id);
    if (!ok) throw new ServiceError("Listing marketplace tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "marketplace.listing.restore", "marketplace_listing", id);
    const row = await this.getListing(ctx, id);
    await this.syncListingCount(ctx, row.integrationId);
    return row;
  },

  async hardDeleteListing(ctx: TenantContext, id: string): Promise<void> {
    const listing = await marketplaceRepo.getListing(ctx, id);
    const ok = await marketplaceRepo.hardDeleteListing(ctx, id);
    if (!ok) throw new ServiceError("Listing marketplace tidak ditemukan", 404, "not_found");
    if (listing) await this.syncListingCount(ctx, listing.integrationId);
    await this.audit(ctx, "marketplace.listing.purge", "marketplace_listing", id);
  },

  /** Recompute + persist the integration's denormalized `listing_count`. */
  async syncListingCount(ctx: TenantContext, integrationId: string): Promise<void> {
    const count = await marketplaceRepo.countListings(ctx, integrationId);
    await marketplaceRepo.updateIntegration(ctx, integrationId, { listingCount: count });
  },

  // ═══════════════════════ internal helpers ═════════════════════════
  /** Write a tenant-scoped audit row for a marketplace mutation. */
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
