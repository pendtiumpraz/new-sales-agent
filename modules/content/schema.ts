import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Module 9 (secondary) · content domain schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: message/content templates + content planning. Owns two tables:
 *   - `content_template` — a reusable message/content TEMPLATE (e.g. a WhatsApp
 *                          opener, an email follow-up, a social caption). Carries
 *                          a `channel` (wa|email|instagram|linkedin|sms|other), a
 *                          `category` (outreach|nurture|retention|promo|other), the
 *                          `body` (with `{{variables}}`), an optional email
 *                          `subject`, declared `variables`, and a `status`
 *                          (draft|active|archived).
 *   - `content_plan`     — a content PLANNING item (an editorial-calendar entry):
 *                          links an optional template, has a `title`, a `channel`,
 *                          a free-form `body`, a `scheduled_at` publish time, and a
 *                          `status` (idea|planned|scheduled|published|archived).
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` (workspace_id, template_id, …) is a plain text
 *    soft ref; integrity is enforced in the service layer, never the DB.
 *  - Grain = TENANT: every table carries `tenant_id text not null` + a
 *    `*_tenant_idx`, read/written wrapped in `withTenant`. Rows are additionally
 *    scoped by `workspace_id` IN-APP (no FK).
 *  - Every entity has `id`, `created_at`, `updated_at`, nullable `deleted_at`
 *    (SOFT DELETE). Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION: the legacy prototype `lib/db/schema.ts` defines
 * `email_template` (a different, narrower shape). The rebuild content tables use
 * the distinct SQL names `content_template` / `content_plan`, so there is no
 * collision in the merged drizzle client. The live Neon DB is NOT touched this
 * tick (db:generate only).
 */

// ── content_template (TENANT — a reusable message/content template) ──────────
export const contentTemplateTable = pgTable(
  "content_template",
  {
    id: text("id").primaryKey(), // cnt_…
    tenantId: text("tenant_id").notNull(),
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id (sales focus)
    name: text("name").notNull(),
    channel: text("channel").notNull().default("wa"), // wa|email|instagram|linkedin|sms|other
    category: text("category").notNull().default("outreach"), // outreach|nurture|retention|promo|other
    subject: text("subject"), // email subject (email channel only)
    body: text("body").notNull().default(""), // message body with {{variables}}
    variables: jsonb("variables").$type<string[]>().notNull().default([]), // declared merge vars
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("draft"), // draft|active|archived
    usageCount: integer("usage_count").notNull().default(0), // times rendered/sent (denormalized)
    createdBy: text("created_by"), // soft ref → app_user.id
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("content_template_tenant_idx").on(t.tenantId),
    workspaceIdx: index("content_template_workspace_idx").on(t.tenantId, t.workspaceId),
    channelIdx: index("content_template_channel_idx").on(t.tenantId, t.channel),
  }),
);

// ── content_plan (TENANT — an editorial-calendar / content planning item) ────
export const contentPlanTable = pgTable(
  "content_plan",
  {
    id: text("id").primaryKey(), // cpl_…
    tenantId: text("tenant_id").notNull(),
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id
    templateId: text("template_id"), // soft ref → content_template.id (optional source)
    title: text("title").notNull(),
    channel: text("channel").notNull().default("wa"), // wa|email|instagram|linkedin|sms|other
    body: text("body"), // planned copy (may be drafted from the template)
    status: text("status").notNull().default("idea"), // idea|planned|scheduled|published|archived
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }), // when it's due to publish
    publishedAt: timestamp("published_at", { withTimezone: true }),
    assignedUserId: text("assigned_user_id"), // soft ref → app_user.id (owner)
    meta: jsonb("meta").$type<Record<string, unknown>>(), // extras (asset urls, audience, …)
    createdBy: text("created_by"), // soft ref → app_user.id
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("content_plan_tenant_idx").on(t.tenantId),
    workspaceIdx: index("content_plan_workspace_idx").on(t.tenantId, t.workspaceId),
    statusIdx: index("content_plan_status_idx").on(t.tenantId, t.status),
    scheduledIdx: index("content_plan_scheduled_idx").on(t.tenantId, t.scheduledAt),
  }),
);

export type ContentTemplateRow = typeof contentTemplateTable.$inferSelect;
export type ContentTemplateInsert = typeof contentTemplateTable.$inferInsert;
export type ContentPlanRow = typeof contentPlanTable.$inferSelect;
export type ContentPlanInsert = typeof contentPlanTable.$inferInsert;
