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
 * Module 1 · onboarding + entitlements domain schema (rebuild).
 *
 * Drives usage/vertical-based onboarding: a tenant picks a vertical (HR / Sales /
 * other) → that sets the enabled `module_catalog` rows → written as
 * `tenant_entitlement`. Entitlement / quota grain = TENANT.
 *
 * Extends (does not reinvent) lib/entitlements.ts semantics: absent
 * `tenant_entitlement` row = ENABLED by default.
 *
 * New SQL names — `vertical`, `module_catalog`, `tenant_entitlement_v2`,
 * `onboarding_state` — no collision with the legacy `tenant_entitlement` table.
 */

// ── vertical (GLOBAL catalog) ──
export const verticalTable = pgTable(
  "vertical",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(), // hr | sales | other (extensible)
    name: text("name").notNull(),
    description: text("description"),
    defaultModules: jsonb("default_modules").$type<string[]>().notNull().default([]),
    icon: text("icon"),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    keyIdx: uniqueIndex("vertical_key_idx").on(t.key),
  }),
);

// ── module_catalog (GLOBAL catalog — replaces hardcoded MODULES) ──
export const moduleCatalogTable = pgTable(
  "module_catalog",
  {
    id: text("id").primaryKey(),
    moduleKey: text("module_key").notNull().unique(), // = route/href + toggle key
    label: text("label").notNull(),
    domain: text("domain"), // owning module domain
    isCore: boolean("is_core").notNull().default(false), // core: always on, not toggleable
    sidebarColor: text("sidebar_color"), // 1-color solid icon hex
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    keyIdx: uniqueIndex("module_catalog_key_idx").on(t.moduleKey),
  }),
);

// ── tenant_entitlement (TENANT — per-tenant module on/off + quota override) ──
export const tenantEntitlementTable = pgTable(
  "tenant_entitlement_v2",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    moduleKey: text("module_key").notNull(), // soft ref → module_catalog.module_key
    enabled: boolean("enabled").notNull().default(true), // absent row = enabled
    quotaOverrides: jsonb("quota_overrides").$type<Record<string, number>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index("tenant_entitlement_v2_tenant_idx").on(t.tenantId),
    uq: uniqueIndex("tenant_entitlement_v2_uq").on(t.tenantId, t.moduleKey),
  }),
);

// ── onboarding_state (TENANT — one row per tenant) ──
export const onboardingStateTable = pgTable("onboarding_state", {
  tenantId: text("tenant_id").primaryKey(), // 1:1 with tenant
  step: text("step").notNull().default("vertical"), // vertical|branding|product|invite_team|done
  verticalKey: text("vertical_key"),
  selectedModules: jsonb("selected_modules").$type<string[]>().notNull().default([]),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}), // scratch answers
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type VerticalRow = typeof verticalTable.$inferSelect;
export type VerticalInsert = typeof verticalTable.$inferInsert;
export type ModuleCatalogRow = typeof moduleCatalogTable.$inferSelect;
export type ModuleCatalogInsert = typeof moduleCatalogTable.$inferInsert;
export type TenantEntitlementRow = typeof tenantEntitlementTable.$inferSelect;
export type TenantEntitlementInsert = typeof tenantEntitlementTable.$inferInsert;
export type OnboardingStateRow = typeof onboardingStateTable.$inferSelect;
export type OnboardingStateInsert = typeof onboardingStateTable.$inferInsert;
