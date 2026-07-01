import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Module 1 · tenant domain schema (rebuild — REAL backend, no mock).
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` is a plain text soft ref; integrity is enforced
 *    in the service layer.
 *  - Every business entity has: `id text primary key`, `created_at`, `updated_at`,
 *    `deleted_at` (nullable) for SOFT DELETE. Repos filter `deleted_at IS NULL`.
 *  - Tenant-scoped tables carry `tenant_id text not null` + a `*_tenant_idx`.
 *
 * NAMING / NON-COLLISION (important): these rebuild tables use NEW SQL names
 * (`tenant`, `app_user`, `membership`, `usage_counter`) so they coexist with the
 * legacy prototype tables in `lib/db/schema.ts` (`tenants`, `users`, `memberships`)
 * without a DDL collision. The rebuild migrates onto these cleanly; the live Neon
 * DB is NOT touched in this tick (db:generate only).
 */

// ── app_user (GLOBAL — one human → many tenants; role lives on membership) ──
export const appUserTable = pgTable("app_user", {
  id: text("id").primaryKey(), // usr_…
  name: text("name").notNull(),
  email: text("email").notNull().unique(), // login id
  passwordHash: text("password_hash").notNull(), // bcrypt/argon2 (no plain text)
  avatarColor: text("avatar_color"),
  isSuperadmin: boolean("is_superadmin").notNull().default(false), // platform staff flag
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
});

// ── tenant (GLOBAL) ──
export const tenantTable = pgTable(
  "tenant",
  {
    id: text("id").primaryKey(), // tnt_…
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(), // URL-safe handle
    status: text("status").notNull().default("pending"), // pending|active|suspended|expired
    verticalKey: text("vertical_key"), // soft ref → vertical.key (onboarding)
    planKey: text("plan_key"), // soft ref → plan.key (set on activation)
    activeUntil: timestamp("active_until", { withTimezone: true }), // null = no activation
    activatedBy: text("activated_by"), // soft ref → app_user.id (superadmin)
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    slugIdx: uniqueIndex("tenant_slug_idx").on(t.slug),
    statusIdx: index("tenant_status_idx").on(t.status),
  }),
);

// ── membership (TENANT — per-tenant role for a user) ──
export const membershipTable = pgTable(
  "membership",
  {
    id: text("id").primaryKey(), // mbr_…
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id").notNull(), // soft ref → app_user.id
    role: text("role").notNull(), // tenant_owner|tenant_admin|sales_manager|sales_rep
    status: text("status").notNull().default("active"), // active|invited|disabled
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantUserUq: uniqueIndex("membership_tenant_user_uq").on(t.tenantId, t.userId),
    tenantIdx: index("membership_tenant_idx").on(t.tenantId),
    userIdx: index("membership_user_idx").on(t.userId),
  }),
);

// ── usage_counter (TENANT — quota rollup; grain = tenant per task) ──
// One row per tenant × metric × period. Period metrics use a 'YYYY-MM' bucket;
// lifetime metrics (seats/contacts/companies) use period = 'lifetime'.
export const usageCounterTable = pgTable(
  "usage_counter",
  {
    id: text("id").primaryKey(), // usg_…
    tenantId: text("tenant_id").notNull(),
    metric: text("metric").notNull(), // seats_max|contacts_max|messages_max|ai_tokens_max|…
    period: text("period").notNull().default("lifetime"), // 'lifetime' | '2026-06'
    used: integer("used").notNull().default(0),
    quotaLimit: integer("quota_limit"), // resolved ceiling cached here; null = unlimited
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index("usage_counter_tenant_idx").on(t.tenantId),
    uq: uniqueIndex("usage_counter_uq").on(t.tenantId, t.metric, t.period),
  }),
);

// ── quota_grant (TENANT — top-up packs on top of the plan) ──
// A time-boxed quota ADD-ON: superadmin grant or a self-serve purchase. The
// effective ceiling for a metric = plan limit + Σ active grants (status='active',
// expires_at in the future). A 30-day pack sets expires_at = now + 30d.
export const quotaGrantTable = pgTable(
  "quota_grant",
  {
    id: text("id").primaryKey(), // qg_…
    tenantId: text("tenant_id").notNull(),
    metric: text("metric").notNull(), // messages_max | ai_tokens_max | contacts_max | …
    amount: integer("amount").notNull(),
    source: text("source").notNull().default("superadmin"), // superadmin | purchase | promo
    provider: text("provider"), // stripe | xendit | tripay | midtrans | null (instant/superadmin)
    externalRef: text("external_ref"), // gateway order/invoice id
    status: text("status").notNull().default("active"), // active | pending | expired | refunded
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // null = no expiry
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("quota_grant_tenant_idx").on(t.tenantId),
    metricIdx: index("quota_grant_tenant_metric_idx").on(t.tenantId, t.metric),
  }),
);

export type TenantRow = typeof tenantTable.$inferSelect;
export type TenantInsert = typeof tenantTable.$inferInsert;
export type AppUserRow = typeof appUserTable.$inferSelect;
export type AppUserInsert = typeof appUserTable.$inferInsert;
export type MembershipRow = typeof membershipTable.$inferSelect;
export type MembershipInsert = typeof membershipTable.$inferInsert;
export type UsageCounterRow = typeof usageCounterTable.$inferSelect;
export type QuotaGrantRow = typeof quotaGrantTable.$inferSelect;
export type QuotaGrantInsert = typeof quotaGrantTable.$inferInsert;
