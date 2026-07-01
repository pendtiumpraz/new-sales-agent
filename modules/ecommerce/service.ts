import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { notificationService } from "@/modules/notification/service";
import { crmService } from "@/modules/crm/service";
import { ecommerceRepo } from "./repo";
import type { MarketplaceOrderRow, CartRecoveryRow, OrderItem } from "./schema";

/**
 * ecommerce domain service — marketplace ORDER ingest + abandoned-CART recovery
 * business logic + validation + cross-module side effects (audit). Routes stay
 * thin: parse → call a method → wrap with the {ok,error} envelope.
 *
 * Owns two tables (marketplace_order, cart_recovery). Referential integrity is
 * enforced HERE (app layer), never via DB FKs (none exist):
 *   - an order/cart's optional `contact_id` is validated against a live CRM
 *     contact through the OWNING module's service (`crmService`, modular-monolith
 *     rule — never reach into another module's tables);
 *   - a cart's `recover` resolves/validates its linked `order_id` in THIS module.
 * Ingest is IDEMPOTENT: a repeated (channel, external_id) updates the existing row
 * instead of creating a duplicate (the unique index also guards it).
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo scopes
 * all reads/writes to `ctx.tenantId` inside `withTenant`.
 */

// ── enums ────────────────────────────────────────────────────────────────────
const CHANNELS = ["tokopedia", "shopee", "tiktok", "other"] as const;
const ORDER_STATUSES = [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
  "refunded",
] as const;
const CART_STATUSES = ["open", "recovered", "expired", "lost"] as const;

// ── input shapes ─────────────────────────────────────────────────────────────
export interface CreateOrderInput {
  channel?: string;
  externalId: string;
  contactId?: string | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
  status?: string;
  total?: number;
  currency?: string;
  items?: OrderItem[];
  note?: string | null;
  orderedAt?: string | null;
  workspaceId?: string | null;
  meta?: Record<string, unknown> | null;
}
export interface UpdateOrderInput {
  status?: string;
  total?: number;
  currency?: string;
  items?: OrderItem[];
  note?: string | null;
  contactId?: string | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface CreateCartInput {
  channel?: string;
  externalId: string;
  contactId?: string | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
  value?: number;
  currency?: string;
  items?: OrderItem[];
  abandonedAt?: string | null;
  workspaceId?: string | null;
  meta?: Record<string, unknown> | null;
}
export interface UpdateCartInput {
  status?: string;
  value?: number;
  currency?: string;
  items?: OrderItem[];
  contactId?: string | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
  meta?: Record<string, unknown> | null;
}

// ── validation helpers ───────────────────────────────────────────────────────
function assertEnum(value: string | undefined, allowed: readonly string[], field: string): string {
  const v = value ?? allowed[0];
  if (!allowed.includes(v)) {
    throw new ServiceError(`${field} harus salah satu dari: ${allowed.join(", ")}`, 400, "validation");
  }
  return v;
}

function parseDate(value: string | null | undefined, field: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ServiceError(`${field} tidak valid`, 400, "validation");
  }
  return d;
}

export const ecommerceService = {
  // ═══════════════════════ marketplace_order ════════════════════════
  async listOrders(
    ctx: TenantContext,
    filter?: { channel?: string; status?: string; contactId?: string; workspaceId?: string },
  ): Promise<MarketplaceOrderRow[]> {
    if (filter?.channel) assertEnum(filter.channel, CHANNELS, "channel");
    if (filter?.status) assertEnum(filter.status, ORDER_STATUSES, "status");
    return ecommerceRepo.listOrders(ctx, filter);
  },

  async listTrashedOrders(ctx: TenantContext): Promise<MarketplaceOrderRow[]> {
    return ecommerceRepo.listTrashedOrders(ctx);
  },

  async getOrder(ctx: TenantContext, id: string): Promise<MarketplaceOrderRow> {
    const row = await ecommerceRepo.getOrder(ctx, id);
    if (!row) throw new ServiceError("Order tidak ditemukan", 404, "not_found");
    return row;
  },

  /**
   * Ingest / create an order from a marketplace channel. IDEMPOTENT: if a live
   * order with the same (channel, external_id) already exists, it is UPDATED with
   * the latest snapshot instead of duplicated.
   */
  async createOrder(ctx: TenantContext, input: CreateOrderInput): Promise<MarketplaceOrderRow> {
    const externalId = input.externalId?.trim();
    if (!externalId) throw new ServiceError("external_id wajib diisi", 400, "validation");
    const channel = assertEnum(input.channel, CHANNELS, "channel");
    const status = assertEnum(input.status, ORDER_STATUSES, "status");
    if (input.contactId) await crmService.getContact(ctx, input.contactId);
    const orderedAt = parseDate(input.orderedAt, "ordered_at");

    const existing = await ecommerceRepo.findOrderByExternal(ctx, channel, externalId);
    if (existing) {
      const row = await ecommerceRepo.updateOrder(ctx, existing.id, {
        contactId: input.contactId ?? existing.contactId,
        buyerName: input.buyerName ?? existing.buyerName,
        buyerPhone: input.buyerPhone ?? existing.buyerPhone,
        status,
        total: input.total ?? existing.total,
        currency: input.currency ?? existing.currency,
        items: input.items ?? existing.items,
        note: input.note ?? existing.note,
        paidAt: status === "paid" && !existing.paidAt ? new Date() : existing.paidAt,
        meta: input.meta ?? existing.meta,
      });
      await this.audit(ctx, "ecommerce.order.upsert", "marketplace_order", existing.id, {
        channel,
        externalId,
      });
      return row!;
    }

    const row = await ecommerceRepo.insertOrder(ctx, {
      id: "ord_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      workspaceId: input.workspaceId ?? null,
      channel,
      externalId,
      contactId: input.contactId ?? null,
      buyerName: input.buyerName ?? null,
      buyerPhone: input.buyerPhone ?? null,
      status,
      total: input.total ?? 0,
      currency: input.currency ?? "IDR",
      items: input.items ?? [],
      note: input.note ?? null,
      orderedAt,
      paidAt: status === "paid" ? new Date() : null,
      meta: input.meta ?? null,
    });
    await this.audit(ctx, "ecommerce.order.create", "marketplace_order", row.id, {
      channel,
      externalId,
    });
    return row;
  },

  async updateOrder(
    ctx: TenantContext,
    id: string,
    input: UpdateOrderInput,
  ): Promise<MarketplaceOrderRow> {
    const order = await this.getOrder(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) {
      const status = assertEnum(input.status, ORDER_STATUSES, "status");
      patch.status = status;
      if (status === "paid" && !order.paidAt) patch.paidAt = new Date();
    }
    if (input.contactId !== undefined) {
      if (input.contactId) await crmService.getContact(ctx, input.contactId);
      patch.contactId = input.contactId;
    }
    for (const f of ["total", "currency", "items", "note", "buyerName", "buyerPhone", "meta"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await ecommerceRepo.updateOrder(ctx, id, patch);
    if (!row) throw new ServiceError("Order tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "ecommerce.order.update", "marketplace_order", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  /**
   * Convert a PAID/COMPLETED marketplace order into CRM: upsert the buyer as a
   * `contact` (reuse the order's linked contact if live, else dedup by phone/email,
   * else create), create a WON `deal` (value = order total) in the default
   * pipeline's `is_won` stage, and back-link the order to the upserted contact.
   *
   * All CRM writes go through `crmService` (modular-monolith rule — ecommerce never
   * touches CRM tables) and reuse its create/dedup logic (no duplication). If the
   * tenant has no pipeline (or the default pipeline has no won stage) the WON deal
   * is still created, just unattached to a stage — the conversion never blocks.
   */
  async convertOrderToCrm(
    ctx: TenantContext,
    orderId: string,
  ): Promise<{ order: MarketplaceOrderRow; contactId: string; dealId: string }> {
    const order = await this.getOrder(ctx, orderId);
    const CONVERTIBLE = ["paid", "shipped", "delivered", "completed"];
    if (!CONVERTIBLE.includes(order.status)) {
      throw new ServiceError(
        "Hanya pesanan yang sudah dibayar/selesai yang bisa dikonversi ke CRM",
        409,
        "not_paid",
      );
    }

    const phone = order.buyerPhone?.trim() || null;
    const buyerName = order.buyerName?.trim() || `Pembeli ${order.externalId}`;

    // 1) Resolve/upsert the buyer contact.
    let contactId: string | null = null;
    // (a) already linked → verify it's still live.
    if (order.contactId) {
      try {
        const live = await crmService.getContact(ctx, order.contactId);
        contactId = live.id;
      } catch (e) {
        if (!(e instanceof ServiceError && e.code === "not_found")) throw e;
      }
    }
    // (b) else dedup by phone/email against existing contacts.
    if (!contactId) {
      const dup = await crmService.findContactByPhoneOrEmail(ctx, { phone });
      if (dup) contactId = dup.id;
    }
    // (c) else create a fresh contact from the order's buyer snapshot.
    if (!contactId) {
      const created = await crmService.createContact(ctx, {
        fullName: buyerName,
        phone,
        whatsapp: phone,
        segment: "b2c",
        source: `ecommerce:${order.channel}`,
        workspaceId: order.workspaceId ?? null,
      });
      contactId = created.id;
    }

    // 2) Resolve the default pipeline + its won stage (best-effort — no hard block).
    const pipelines = await crmService.listPipelines(ctx);
    const defaultPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0] ?? null;
    let wonStageId: string | null = null;
    if (defaultPipeline) {
      const stages = await crmService.listStages(ctx, defaultPipeline.id);
      wonStageId = stages.find((s) => s.isWon)?.id ?? null;
    }

    // 3) Create the WON deal (reuse crmService — value = order total).
    const deal = await crmService.createDeal(ctx, {
      name: `Pesanan ${order.externalId}`,
      contactId,
      pipelineId: defaultPipeline?.id ?? null,
      stageId: wonStageId,
      workspaceId: order.workspaceId ?? null,
      value: order.total,
      currency: order.currency,
      status: "won",
      sourceChannel: `ecommerce:${order.channel}`,
    });

    // 4) Back-link the order → upserted contact.
    const updated = await ecommerceRepo.updateOrder(ctx, order.id, { contactId });
    await this.audit(ctx, "ecommerce.order.convert", "marketplace_order", order.id, {
      contactId,
      dealId: deal.id,
      value: order.total,
    });
    // Persistent notification: an order became a CRM deal. Tenant-wide; best-effort.
    await notificationService.emit(ctx, {
      type: "order",
      title: "Order masuk ke CRM",
      body: `Pesanan ${order.externalId} dikonversi jadi deal.`,
      link: "/pipeline",
      meta: { orderId: order.id, dealId: deal.id, contactId, value: order.total },
    });
    return { order: updated ?? order, contactId, dealId: deal.id };
  },

  async softDeleteOrder(ctx: TenantContext, id: string): Promise<void> {
    const ok = await ecommerceRepo.softDeleteOrder(ctx, id);
    if (!ok) throw new ServiceError("Order tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "ecommerce.order.delete", "marketplace_order", id);
  },

  async restoreOrder(ctx: TenantContext, id: string): Promise<MarketplaceOrderRow> {
    const ok = await ecommerceRepo.restoreOrder(ctx, id);
    if (!ok) throw new ServiceError("Order tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "ecommerce.order.restore", "marketplace_order", id);
    return this.getOrder(ctx, id);
  },

  async hardDeleteOrder(ctx: TenantContext, id: string): Promise<void> {
    const ok = await ecommerceRepo.hardDeleteOrder(ctx, id);
    if (!ok) throw new ServiceError("Order tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "ecommerce.order.purge", "marketplace_order", id);
  },

  // ═══════════════════════ cart_recovery ════════════════════════════
  async listCarts(
    ctx: TenantContext,
    filter?: { channel?: string; status?: string; workspaceId?: string },
  ): Promise<CartRecoveryRow[]> {
    if (filter?.channel) assertEnum(filter.channel, CHANNELS, "channel");
    if (filter?.status) assertEnum(filter.status, CART_STATUSES, "status");
    return ecommerceRepo.listCarts(ctx, filter);
  },

  async listTrashedCarts(ctx: TenantContext): Promise<CartRecoveryRow[]> {
    return ecommerceRepo.listTrashedCarts(ctx);
  },

  async getCart(ctx: TenantContext, id: string): Promise<CartRecoveryRow> {
    const row = await ecommerceRepo.getCart(ctx, id);
    if (!row) throw new ServiceError("Cart tidak ditemukan", 404, "not_found");
    return row;
  },

  /**
   * Ingest / create an abandoned-cart record. IDEMPOTENT on (channel, external_id):
   * a repeat updates the existing open cart instead of duplicating it.
   */
  async createCart(ctx: TenantContext, input: CreateCartInput): Promise<CartRecoveryRow> {
    const externalId = input.externalId?.trim();
    if (!externalId) throw new ServiceError("external_id wajib diisi", 400, "validation");
    const channel = assertEnum(input.channel, CHANNELS, "channel");
    if (input.contactId) await crmService.getContact(ctx, input.contactId);
    const abandonedAt = parseDate(input.abandonedAt, "abandoned_at");

    const existing = await ecommerceRepo.findCartByExternal(ctx, channel, externalId);
    if (existing) {
      const row = await ecommerceRepo.updateCart(ctx, existing.id, {
        contactId: input.contactId ?? existing.contactId,
        buyerName: input.buyerName ?? existing.buyerName,
        buyerPhone: input.buyerPhone ?? existing.buyerPhone,
        value: input.value ?? existing.value,
        currency: input.currency ?? existing.currency,
        items: input.items ?? existing.items,
        meta: input.meta ?? existing.meta,
      });
      await this.audit(ctx, "ecommerce.cart.upsert", "cart_recovery", existing.id, {
        channel,
        externalId,
      });
      return row!;
    }

    const row = await ecommerceRepo.insertCart(ctx, {
      id: "crt_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      workspaceId: input.workspaceId ?? null,
      channel,
      externalId,
      contactId: input.contactId ?? null,
      buyerName: input.buyerName ?? null,
      buyerPhone: input.buyerPhone ?? null,
      value: input.value ?? 0,
      currency: input.currency ?? "IDR",
      items: input.items ?? [],
      status: "open",
      attempts: 0,
      abandonedAt,
      meta: input.meta ?? null,
    });
    await this.audit(ctx, "ecommerce.cart.create", "cart_recovery", row.id, { channel, externalId });
    return row;
  },

  async updateCart(
    ctx: TenantContext,
    id: string,
    input: UpdateCartInput,
  ): Promise<CartRecoveryRow> {
    await this.getCart(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) patch.status = assertEnum(input.status, CART_STATUSES, "status");
    if (input.contactId !== undefined) {
      if (input.contactId) await crmService.getContact(ctx, input.contactId);
      patch.contactId = input.contactId;
    }
    for (const f of ["value", "currency", "items", "buyerName", "buyerPhone", "meta"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await ecommerceRepo.updateCart(ctx, id, patch);
    if (!row) throw new ServiceError("Cart tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "ecommerce.cart.update", "cart_recovery", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  /** Record a recovery nudge (bumps attempts + stamps last_attempt_at). */
  async nudgeCart(ctx: TenantContext, id: string): Promise<CartRecoveryRow> {
    const cart = await this.getCart(ctx, id);
    if (cart.status !== "open") {
      throw new ServiceError("Cart sudah tidak open", 409, "not_open");
    }
    const row = await ecommerceRepo.updateCart(ctx, id, {
      attempts: cart.attempts + 1,
      lastAttemptAt: new Date(),
    });
    if (!row) throw new ServiceError("Cart tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "ecommerce.cart.nudge", "cart_recovery", id, { attempts: row.attempts });
    return row;
  },

  /** Mark a cart recovered, optionally linking the resulting order. */
  async recoverCart(
    ctx: TenantContext,
    id: string,
    orderId?: string | null,
  ): Promise<CartRecoveryRow> {
    await this.getCart(ctx, id);
    // Integrity: a linked order must be a live order in THIS module.
    if (orderId) await this.getOrder(ctx, orderId);
    const row = await ecommerceRepo.updateCart(ctx, id, {
      status: "recovered",
      orderId: orderId ?? null,
      recoveredAt: new Date(),
    });
    if (!row) throw new ServiceError("Cart tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "ecommerce.cart.recover", "cart_recovery", id, { orderId: orderId ?? null });
    return row;
  },

  async softDeleteCart(ctx: TenantContext, id: string): Promise<void> {
    const ok = await ecommerceRepo.softDeleteCart(ctx, id);
    if (!ok) throw new ServiceError("Cart tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "ecommerce.cart.delete", "cart_recovery", id);
  },

  async restoreCart(ctx: TenantContext, id: string): Promise<CartRecoveryRow> {
    const ok = await ecommerceRepo.restoreCart(ctx, id);
    if (!ok) throw new ServiceError("Cart tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "ecommerce.cart.restore", "cart_recovery", id);
    return this.getCart(ctx, id);
  },

  async hardDeleteCart(ctx: TenantContext, id: string): Promise<void> {
    const ok = await ecommerceRepo.hardDeleteCart(ctx, id);
    if (!ok) throw new ServiceError("Cart tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "ecommerce.cart.purge", "cart_recovery", id);
  },

  // ═══════════════════════ internal helpers ═════════════════════════
  /** Write a tenant-scoped audit row for an ecommerce mutation. */
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
