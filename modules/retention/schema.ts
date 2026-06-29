import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Module 9 (secondary) · retention domain schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: retention / win-back flows + their steps. Owns two tables:
 *   - `retention_flow` — a named RETENTION or WIN-BACK sequence (e.g. "Churn save
 *                        14-day", "Win-back dormant 60d"). Carries a `kind`
 *                        (retention|win_back|onboarding|loyalty), a `trigger`
 *                        (the condition that enrolls a customer — e.g.
 *                        `no_activity_30d`, `churn_risk`, `post_purchase`), a
 *                        `status` (active|paused|archived), and the target
 *                        `segment` (b2c|b2b|all). `step_count` denormalized.
 *   - `retention_step` — the ORDERED steps of a flow: a `channel` (wa|email|call|
 *                        sms), a `delay_days` wait before this step fires, an
 *                        `offer` (the incentive — e.g. a discount code/voucher),
 *                        the message `template`, and a `sort` (0-based order).
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` (workspace_id, flow_id, …) is a plain text
 *    soft ref; integrity is enforced in the service layer, never the DB.
 *  - Grain = TENANT: every table carries `tenant_id text not null` + a
 *    `*_tenant_idx`, read/written wrapped in `withTenant`. Rows are additionally
 *    scoped by `workspace_id` IN-APP (no FK).
 *  - Every entity has `id`, `created_at`, `updated_at`, nullable `deleted_at`
 *    (SOFT DELETE). Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION: no legacy twin exists for these names, so they get clean
 * `retention_flow` / `retention_step` names. The live Neon DB is NOT touched this
 * tick (db:generate only).
 */

// ── retention_flow (TENANT — a named retention / win-back sequence) ──────────
export const retentionFlowTable = pgTable(
  "retention_flow",
  {
    id: text("id").primaryKey(), // rfl_…
    tenantId: text("tenant_id").notNull(),
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id (sales focus)
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind").notNull().default("retention"), // retention|win_back|onboarding|loyalty
    trigger: text("trigger").notNull().default("manual"), // no_activity_30d|churn_risk|post_purchase|manual|…
    segment: text("segment").notNull().default("all"), // b2c|b2b|all
    status: text("status").notNull().default("active"), // active|paused|archived
    stepCount: integer("step_count").notNull().default(0), // denormalized for list rendering
    createdBy: text("created_by"), // soft ref → app_user.id
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("retention_flow_tenant_idx").on(t.tenantId),
    workspaceIdx: index("retention_flow_workspace_idx").on(t.tenantId, t.workspaceId),
    kindIdx: index("retention_flow_kind_idx").on(t.tenantId, t.kind),
  }),
);

// ── retention_step (TENANT — ordered steps of a retention flow) ──────────────
export const retentionStepTable = pgTable(
  "retention_step",
  {
    id: text("id").primaryKey(), // rst_…
    tenantId: text("tenant_id").notNull(),
    flowId: text("flow_id").notNull(), // soft ref → retention_flow.id
    sort: integer("sort").notNull().default(0), // 0-based order within the flow
    channel: text("channel").notNull().default("wa"), // wa|email|call|sms
    delayDays: integer("delay_days").notNull().default(0), // wait (days) before this step fires
    subject: text("subject"), // email subject (email channel only)
    template: text("template").notNull().default(""), // message body / call script
    offer: text("offer"), // incentive (discount code/voucher) attached to this step
    meta: jsonb("meta").$type<Record<string, unknown>>(), // step-specific extras
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("retention_step_tenant_idx").on(t.tenantId),
    flowIdx: index("retention_step_flow_idx").on(t.tenantId, t.flowId),
  }),
);

export type RetentionFlowRow = typeof retentionFlowTable.$inferSelect;
export type RetentionFlowInsert = typeof retentionFlowTable.$inferInsert;
export type RetentionStepRow = typeof retentionStepTable.$inferSelect;
export type RetentionStepInsert = typeof retentionStepTable.$inferInsert;
