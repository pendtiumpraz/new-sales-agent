import {
  pgTable,
  text,
  jsonb,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Module 9 (secondary) · reports / analytics domain schema (rebuild — REAL backend).
 *
 * DOMAIN: dashboards + analytics. The reports SERVICE is read-only and AGGREGATES
 * over EXISTING rebuild tables (crm contacts/deals/pipeline_stage, inbox
 * conversations, sales closing_readiness, ecommerce orders, field visits) — it
 * introduces NO new heavy/event tables. The ONLY table it owns is a thin config
 * row:
 *   - `saved_report` — a saved DASHBOARD/report CONFIG (a named view): a `kind`
 *                      (the aggregate it renders — e.g. `contacts_by_segment`,
 *                      `deals_by_stage`, `pipeline_overview`, `closing_funnel`,
 *                      `marketplace_sales`, `field_activity`, `overview`), a
 *                      `config` blob (filters + chart prefs), a `scope`
 *                      (private|tenant), and an `is_pinned` flag. CRUD + soft-
 *                      delete only; the actual numbers are computed live by the
 *                      service against the existing tables.
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — `owner_user_id` / `workspace_id` are plain text soft refs.
 *  - Grain = TENANT: carries `tenant_id text not null` + a `*_tenant_idx`,
 *    read/written wrapped in `withTenant`.
 *  - `id`, `created_at`, `updated_at`, nullable `deleted_at` (SOFT DELETE).
 *
 * NAMING / NON-COLLISION: no legacy twin for `saved_report`. The live Neon DB is
 * NOT touched this tick (db:generate only).
 */

// ── saved_report (TENANT — a saved dashboard / report config) ────────────────
export const savedReportTable = pgTable(
  "saved_report",
  {
    id: text("id").primaryKey(), // rpt_…
    tenantId: text("tenant_id").notNull(),
    ownerUserId: text("owner_user_id"), // soft ref → app_user.id (creator)
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id (optional scope)
    name: text("name").notNull(),
    kind: text("kind").notNull().default("overview"), // contacts_by_segment|deals_by_stage|pipeline_overview|closing_funnel|marketplace_sales|field_activity|overview
    description: text("description"),
    config: jsonb("config").$type<Record<string, unknown>>(), // filters + chart prefs
    scope: text("scope").notNull().default("private"), // private|tenant
    isPinned: boolean("is_pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("saved_report_tenant_idx").on(t.tenantId),
    ownerIdx: index("saved_report_owner_idx").on(t.tenantId, t.ownerUserId),
    kindIdx: index("saved_report_kind_idx").on(t.tenantId, t.kind),
  }),
);

export type SavedReportRow = typeof savedReportTable.$inferSelect;
export type SavedReportInsert = typeof savedReportTable.$inferInsert;
