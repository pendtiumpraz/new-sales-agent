import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Module 1 · superadmin domain schema (rebuild).
 *
 * The superadmin console activates/suspends/creates tenants. It needs two
 * cross-cutting platform tables to operate in M1:
 *  - platform_setting: global key/value (deployment_mode, wa_mode, default theme…)
 *  - audit_log: append-only trail of sensitive actions (tenant.activate, …)
 *
 * (M10 `platform` will formally own these; M1 introduces them here because the
 * superadmin flow is the first writer.) Append-only — no `deleted_at`.
 *
 * New SQL names (`platform_setting_v2`, `audit_log_v2`) — no legacy collision.
 */

// ── platform_setting (GLOBAL key/value) ──
export const platformSettingTable = pgTable("platform_setting_v2", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── audit_log (tenant-aware; tenant_id nullable for platform events) ──
export const auditLogTable = pgTable(
  "audit_log_v2",
  {
    id: text("id").primaryKey(), // aud_…
    tenantId: text("tenant_id"), // nullable (platform-level events)
    actorUserId: text("actor_user_id"), // soft ref → app_user.id
    action: text("action").notNull(), // tenant.activate | member.invite | theme.update | …
    targetType: text("target_type"), // what kind of thing was acted on
    targetId: text("target_id"), // soft ref to the target
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index("audit_log_v2_tenant_idx").on(t.tenantId),
    actionIdx: index("audit_log_v2_action_idx").on(t.action),
  }),
);

export type PlatformSettingRow = typeof platformSettingTable.$inferSelect;
export type AuditLogRow = typeof auditLogTable.$inferSelect;
