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
 * Module 9 (secondary) · marketplace domain schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: marketplace as a LEAD SOURCE — the connected channel integrations and
 * the product listings published on them (the listings buyers engage with become
 * leads/conversations upstream). Owns two tables:
 *   - `marketplace_integration` — a CONNECTED marketplace account/store: the
 *                                 `channel` (tokopedia|shopee|tiktok|lazada|other),
 *                                 a `store_name`, the external `store_id`, a
 *                                 `status` (connected|pending|disconnected|error),
 *                                 a `last_sync_at`, and a `config` blob (NO secrets
 *                                 in plain text — credential handles only). One per
 *                                 (tenant, channel, store_id).
 *   - `marketplace_listing_v2`  — a product LISTING on a marketplace: a soft ref to
 *                                 the owning integration + the CRM `product_id`, the
 *                                 listing's `external_id`, `title`, `price`, `stock`,
 *                                 a `status` (draft|active|paused|out_of_stock|
 *                                 removed), and engagement counters (`views`,
 *                                 `leads`) that feed the lead-source reports.
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` (integration_id, product_id, workspace_id) is a
 *    plain text soft ref; integrity is enforced in the service layer, never the DB.
 *  - Grain = TENANT: every table carries `tenant_id text not null` + a
 *    `*_tenant_idx`, read/written wrapped in `withTenant`.
 *  - Every entity has `id`, `created_at`, `updated_at`, nullable `deleted_at`
 *    (SOFT DELETE). Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION (important): the legacy prototype `lib/db/schema.ts`
 * defines `pgTable("marketplace_listing")`. Two pgTable calls with the same SQL
 * name in one merged drizzle client generate conflicting DDL, so the rebuild
 * listing table uses the NEW SQL name `marketplace_listing_v2` (same `_v2`
 * precedent as `company_v2` / `conversation_v2`). `marketplace_integration` has no
 * legacy twin, so it gets a clean name. The live Neon DB is NOT touched this tick
 * (db:generate only).
 */

// ── marketplace_integration (TENANT — a connected marketplace store) ─────────
export const marketplaceIntegrationTable = pgTable(
  "marketplace_integration",
  {
    id: text("id").primaryKey(), // mki_…
    tenantId: text("tenant_id").notNull(),
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id
    channel: text("channel").notNull().default("tokopedia"), // tokopedia|shopee|tiktok|lazada|other
    storeName: text("store_name").notNull(),
    storeId: text("store_id"), // external store/shop id on the channel
    status: text("status").notNull().default("pending"), // connected|pending|disconnected|error
    config: jsonb("config").$type<Record<string, unknown>>(), // credential HANDLES + sync prefs (no plain secrets)
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    listingCount: integer("listing_count").notNull().default(0), // denormalized for list rendering
    connectedBy: text("connected_by"), // soft ref → app_user.id
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("marketplace_integration_tenant_idx").on(t.tenantId),
    channelIdx: index("marketplace_integration_channel_idx").on(t.tenantId, t.channel),
    // One integration per (tenant, channel, store_id) — idempotent connect.
    storeUq: uniqueIndex("marketplace_integration_store_uq").on(
      t.tenantId,
      t.channel,
      t.storeId,
    ),
  }),
);

// ── marketplace_listing_v2 (TENANT — a product listing on a marketplace) ─────
export const marketplaceListingTable = pgTable(
  "marketplace_listing_v2",
  {
    id: text("id").primaryKey(), // mkl_…
    tenantId: text("tenant_id").notNull(),
    integrationId: text("integration_id").notNull(), // soft ref → marketplace_integration.id
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id
    productId: text("product_id"), // soft ref → product_v2.id (the listed product)
    channel: text("channel").notNull().default("tokopedia"), // denormalized from the integration
    externalId: text("external_id"), // listing id on the channel
    title: text("title").notNull(),
    url: text("url"),
    price: real("price").notNull().default(0),
    currency: text("currency").notNull().default("IDR"),
    stock: integer("stock").notNull().default(0),
    status: text("status").notNull().default("draft"), // draft|active|paused|out_of_stock|removed
    views: integer("views").notNull().default(0), // engagement counter (lead-source signal)
    leads: integer("leads").notNull().default(0), // leads attributed to this listing
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("marketplace_listing_v2_tenant_idx").on(t.tenantId),
    integrationIdx: index("marketplace_listing_v2_integration_idx").on(t.tenantId, t.integrationId),
    productIdx: index("marketplace_listing_v2_product_idx").on(t.tenantId, t.productId),
    statusIdx: index("marketplace_listing_v2_status_idx").on(t.tenantId, t.status),
  }),
);

export type MarketplaceIntegrationRow = typeof marketplaceIntegrationTable.$inferSelect;
export type MarketplaceIntegrationInsert = typeof marketplaceIntegrationTable.$inferInsert;
export type MarketplaceListingRow = typeof marketplaceListingTable.$inferSelect;
export type MarketplaceListingInsert = typeof marketplaceListingTable.$inferInsert;
