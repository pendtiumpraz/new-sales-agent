import {
  pgTable,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Module 9 (secondary) · ecommerce domain schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: orders pulled from marketplace channels (Tokopedia / Shopee / TikTok
 * Shop) + abandoned-cart recovery. Owns two tables:
 *   - `marketplace_order` — an ORDER captured from a marketplace channel. Carries
 *                           the `channel` (tokopedia|shopee|tiktok|other), the
 *                           channel's `external_id` (the marketplace order no.,
 *                           unique per tenant+channel for idempotent ingest), a
 *                           `status` (pending|paid|shipped|delivered|completed|
 *                           cancelled|refunded), the `total`/`currency`, the buyer
 *                           snapshot (name/phone), a soft ref to a CRM `contact_id`,
 *                           and the line `items`.
 *   - `cart_recovery`     — an ABANDONED-CART recovery record: the channel + the
 *                           cart `external_id`, the buyer, the cart `value`/`items`,
 *                           a `status` (open|recovered|expired|lost), the recovery
 *                           `attempts`/`last_attempt_at`, and (when recovered) the
 *                           resulting `order_id`.
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` (workspace_id, contact_id, order_id, …) is a
 *    plain text soft ref; integrity is enforced in the service layer, never the DB.
 *  - Grain = TENANT: every table carries `tenant_id text not null` + a
 *    `*_tenant_idx`, read/written wrapped in `withTenant`.
 *  - Every entity has `id`, `created_at`, `updated_at`, nullable `deleted_at`
 *    (SOFT DELETE). Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION: no legacy twin exists for `marketplace_order` /
 * `cart_recovery` (legacy has `marketplace_listing` only), so they get clean
 * names. The live Neon DB is NOT touched this tick (db:generate only).
 */

export interface OrderItem {
  name: string;
  sku?: string;
  qty: number;
  price: number;
}

// ── marketplace_order (TENANT — an order from a marketplace channel) ─────────
export const marketplaceOrderTable = pgTable(
  "marketplace_order",
  {
    id: text("id").primaryKey(), // ord_…
    tenantId: text("tenant_id").notNull(),
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id
    channel: text("channel").notNull().default("tokopedia"), // tokopedia|shopee|tiktok|other
    externalId: text("external_id").notNull(), // marketplace order number (idempotent ingest key)
    contactId: text("contact_id"), // soft ref → contact.id (the buyer in CRM, optional)
    buyerName: text("buyer_name"),
    buyerPhone: text("buyer_phone"),
    status: text("status").notNull().default("pending"), // pending|paid|shipped|delivered|completed|cancelled|refunded
    total: real("total").notNull().default(0),
    currency: text("currency").notNull().default("IDR"),
    items: jsonb("items").$type<OrderItem[]>().notNull().default([]),
    note: text("note"),
    orderedAt: timestamp("ordered_at", { withTimezone: true }), // marketplace order timestamp
    paidAt: timestamp("paid_at", { withTimezone: true }),
    meta: jsonb("meta").$type<Record<string, unknown>>(), // raw channel payload extras
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("marketplace_order_tenant_idx").on(t.tenantId),
    channelIdx: index("marketplace_order_channel_idx").on(t.tenantId, t.channel),
    statusIdx: index("marketplace_order_status_idx").on(t.tenantId, t.status),
    contactIdx: index("marketplace_order_contact_idx").on(t.tenantId, t.contactId),
    // Idempotent ingest: one order per (tenant, channel, external_id).
    externalUq: uniqueIndex("marketplace_order_external_uq").on(
      t.tenantId,
      t.channel,
      t.externalId,
    ),
  }),
);

// ── cart_recovery (TENANT — an abandoned-cart recovery record) ───────────────
export const cartRecoveryTable = pgTable(
  "cart_recovery",
  {
    id: text("id").primaryKey(), // crt_…
    tenantId: text("tenant_id").notNull(),
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id
    channel: text("channel").notNull().default("tokopedia"), // tokopedia|shopee|tiktok|other
    externalId: text("external_id").notNull(), // marketplace cart id (idempotent key)
    contactId: text("contact_id"), // soft ref → contact.id (the buyer, optional)
    buyerName: text("buyer_name"),
    buyerPhone: text("buyer_phone"),
    value: real("value").notNull().default(0), // cart value
    currency: text("currency").notNull().default("IDR"),
    items: jsonb("items").$type<OrderItem[]>().notNull().default([]),
    status: text("status").notNull().default("open"), // open|recovered|expired|lost
    attempts: integer("attempts").notNull().default(0), // recovery nudges sent
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    orderId: text("order_id"), // soft ref → marketplace_order.id (set when recovered)
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }), // when the cart was abandoned
    recoveredAt: timestamp("recovered_at", { withTimezone: true }),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("cart_recovery_tenant_idx").on(t.tenantId),
    channelIdx: index("cart_recovery_channel_idx").on(t.tenantId, t.channel),
    statusIdx: index("cart_recovery_status_idx").on(t.tenantId, t.status),
    // Idempotent ingest: one cart per (tenant, channel, external_id).
    externalUq: uniqueIndex("cart_recovery_external_uq").on(t.tenantId, t.channel, t.externalId),
  }),
);

export type MarketplaceOrderRow = typeof marketplaceOrderTable.$inferSelect;
export type MarketplaceOrderInsert = typeof marketplaceOrderTable.$inferInsert;
export type CartRecoveryRow = typeof cartRecoveryTable.$inferSelect;
export type CartRecoveryInsert = typeof cartRecoveryTable.$inferInsert;
