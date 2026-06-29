import {
  pgTable,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Module 2 · product domain schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: a product is the single thing a workspace sells (1 workspace = 1
 * product). The workspace references it by id IN-APP only (soft ref, NO FK).
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — soft refs only; integrity enforced in the service layer.
 *  - Grain = TENANT: `tenant_id text not null` + `*_tenant_idx`, read/written
 *    wrapped in `withTenant`.
 *  - Every entity has `id`, `created_at`, `updated_at`, nullable `deleted_at`
 *    (SOFT DELETE). Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION: the legacy `lib/db/schema.ts` already has
 * `pgTable("product")` with the OLD shape, so this rebuild table uses the NEW
 * SQL name `product_v2` (same `_v2` precedent as M1's superseded tables) to
 * coexist in the merged drizzle client without a DDL collision. Live Neon DB
 * untouched this tick (db:generate only).
 */

// ── product_v2 (TENANT) ──────────────────────────────────────────────────────
export const productTable = pgTable(
  "product_v2",
  {
    id: text("id").primaryKey(), // prd_…
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    valueProps: jsonb("value_props").$type<string[]>().notNull().default([]),
    pricingNotes: text("pricing_notes"),
    targetMarket: text("target_market"), // B2B | B2C | both
    icp: jsonb("icp").$type<Record<string, unknown>>(), // AI-derived ideal customer profile
    status: text("status").notNull().default("active"), // active|archived
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("product_v2_tenant_idx").on(t.tenantId),
  }),
);

export type ProductRow = typeof productTable.$inferSelect;
export type ProductInsert = typeof productTable.$inferInsert;
