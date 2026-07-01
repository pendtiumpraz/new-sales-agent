import { pgTable, text, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Persistent notification schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: an in-app notification feed behind the topbar bell. A row is a single
 * event surfaced to a user — a new lead, a won deal, an escalation, a low quota,
 * a marketplace sale, etc. It is written best-effort AT the triggering event
 * (see modules/notification/service.ts `emit`) so a notification failure can
 * never break the action that raised it.
 *
 * GRAIN: TENANT, with an optional user narrowing.
 *   - `user_id = null`  → tenant-wide: visible to EVERY member of the tenant
 *     (e.g. "eskalasi ke manusia", "member baru", tenant activated/suspended).
 *   - `user_id = <id>`  → private to that one user.
 * The read filter (repo.listForCtx) unions both: `user_id IS NULL OR = ctx.userId`.
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` is a plain text soft ref; integrity in-app.
 *  - `tenant_id` + tenant-isolation RLS (drizzle/rls/enable-rls.sql).
 *  - SOFT DELETE via nullable `deleted_at`; the feed filters `deleted_at IS NULL`.
 *    (No `updated_at` — a notification is immutable except for `read`/`deleted_at`.)
 */
export const notificationTable = pgTable(
  "notification",
  {
    id: text("id").primaryKey(), // ntf_…
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id"), // null = tenant-wide (all members); else private to one user
    type: text("type").notNull(), // lead|deal|escalation|quota|marketplace|order|member|tenant
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"), // in-app route to open on click (e.g. /pipeline)
    read: boolean("read").notNull().default(false),
    meta: jsonb("meta").$type<Record<string, unknown>>(), // event-specific extras
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    // Feed read path: scope by tenant + (user|tenant-wide) + unread filter.
    ctxIdx: index("notification_ctx_idx").on(t.tenantId, t.userId, t.read),
    // Newest-first ordering within a tenant.
    createdIdx: index("notification_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export type NotificationRow = typeof notificationTable.$inferSelect;
export type NotificationInsert = typeof notificationTable.$inferInsert;
