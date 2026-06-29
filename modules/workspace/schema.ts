import {
  pgTable,
  text,
  jsonb,
  timestamp,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Module 2 · workspace domain schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: 1 workspace = 1 product (core product rule). A rep owns many
 * workspaces. A workspace carries two 1:1 satellites:
 *   - `market_fit` — the market-fit analysis RESULT (B2B / B2C / mix + ICP).
 *   - `sales_play` — the sales-play CONFIG (technique mix, channel, tone).
 * The workspace references its product by id IN-APP only (soft ref, NO FK).
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` is a plain text soft ref; integrity enforced
 *    in the service layer.
 *  - Grain = TENANT: every table carries `tenant_id text not null` + a
 *    `*_tenant_idx`, and is read/written wrapped in `withTenant`.
 *  - Every business entity has `id`, `created_at`, `updated_at`, and a nullable
 *    `deleted_at` for SOFT DELETE. Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION (important): the legacy prototype `lib/db/schema.ts`
 * already defines `pgTable("workspace")` and `pgTable("product")` with the OLD
 * shapes. Two pgTable calls with the same SQL name in one merged drizzle client
 * generate conflicting DDL, so the rebuild tables use NEW SQL names
 * (`workspace_v2`, `product_v2`) — the same `_v2` precedent M1 used for
 * `audit_log_v2` / `platform_setting_v2` / `tenant_entitlement_v2`. The two new
 * satellites have no legacy twin, so they get clean singular names
 * (`market_fit`, `sales_play`). The live Neon DB is NOT touched this tick
 * (db:generate only).
 */

// ── workspace_v2 (TENANT — 1 workspace = 1 product) ──────────────────────────
export const workspaceTable = pgTable(
  "workspace_v2",
  {
    id: text("id").primaryKey(), // wsp_…
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(), // soft ref → app_user.id (the rep)
    name: text("name").notNull(),
    type: text("type").notNull().default("lead_gen"), // lead_gen|partner|offering|retention|custom
    productId: text("product_id"), // soft ref → product_v2.id (the one product)
    targetSegment: text("target_segment"), // e.g. "AI Engineer Jakarta"
    status: text("status").notNull().default("active"), // active|archived
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("workspace_v2_tenant_idx").on(t.tenantId),
    ownerIdx: index("workspace_v2_owner_idx").on(t.tenantId, t.ownerUserId),
    productIdx: index("workspace_v2_product_idx").on(t.tenantId, t.productId),
  }),
);

// ── market_fit (TENANT — 1:1 satellite of a workspace) ───────────────────────
// The market-fit analysis RESULT for a workspace's product: which side of the
// market it sells to (B2B / B2C / mix) + the AI-derived ICP and rationale.
export const marketFitTable = pgTable(
  "market_fit",
  {
    id: text("id").primaryKey(), // mft_…
    tenantId: text("tenant_id").notNull(),
    workspaceId: text("workspace_id").notNull(), // soft ref → workspace_v2.id (1:1)
    marketType: text("market_type").notNull().default("b2b"), // b2b|b2c|mix
    confidence: real("confidence"), // 0..1 classifier confidence
    icp: jsonb("icp").$type<Record<string, unknown>>(), // AI-derived ideal customer profile
    segments: jsonb("segments").$type<string[]>().notNull().default([]), // target segments
    rationale: text("rationale"), // why this market-type/ICP
    source: text("source"), // ai | manual
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("market_fit_tenant_idx").on(t.tenantId),
    // 1:1 with a workspace — one live market-fit result per workspace.
    workspaceUq: uniqueIndex("market_fit_workspace_uq").on(t.tenantId, t.workspaceId),
  }),
);

// ── sales_play (TENANT — 1:1 satellite of a workspace) ───────────────────────
// The sales-play CONFIG for a workspace: which closing technique(s), channel,
// tone, and step config drive the consultative value-first conversation.
export const salesPlayTable = pgTable(
  "sales_play",
  {
    id: text("id").primaryKey(), // ply_…
    tenantId: text("tenant_id").notNull(),
    workspaceId: text("workspace_id").notNull(), // soft ref → workspace_v2.id (1:1)
    name: text("name"), // optional display name for the play
    channel: text("channel").notNull().default("whatsapp"), // whatsapp|email|instagram|linkedin
    tone: text("tone").notNull().default("consultative"), // consultative|direct|friendly|formal
    techniques: jsonb("techniques").$type<string[]>().notNull().default([]), // closing-technique keys
    steps: jsonb("steps").$type<Record<string, unknown>[]>().notNull().default([]), // ordered play steps
    config: jsonb("config").$type<Record<string, unknown>>(), // freeform play tuning (escape hatch)
    status: text("status").notNull().default("active"), // active|paused
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("sales_play_tenant_idx").on(t.tenantId),
    // 1:1 with a workspace — one live sales-play config per workspace.
    workspaceUq: uniqueIndex("sales_play_workspace_uq").on(t.tenantId, t.workspaceId),
  }),
);

export type WorkspaceRow = typeof workspaceTable.$inferSelect;
export type WorkspaceInsert = typeof workspaceTable.$inferInsert;
export type MarketFitRow = typeof marketFitTable.$inferSelect;
export type MarketFitInsert = typeof marketFitTable.$inferInsert;
export type SalesPlayRow = typeof salesPlayTable.$inferSelect;
export type SalesPlayInsert = typeof salesPlayTable.$inferInsert;
