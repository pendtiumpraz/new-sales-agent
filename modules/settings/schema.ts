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
 * Module 8 · settings domain schema (rebuild — REAL backend, Sainskerta Loop
 * Phase 03). REUSE-HEAVY: most of what the Settings cluster surfaces already has
 * a home and is NOT rebuilt here —
 *
 *   - tenant AI config (active model + BYOK)  → `lib/ai/registry` + the existing
 *     `ai_provider`/`ai_model`/`ai_credential`/`tenant_active_model` tables.
 *   - mailbox config (SMTP/OAuth/ESP)         → `lib/mail/*` + `sending_account`.
 *   - billing summary (plan/usage/credit)     → `lib/billing/*`.
 *   - team / members                          → `modules/tenant` memberships.
 *
 * This module owns ONLY the two genuinely-new tables the platform lacks:
 *
 *   - `knowledge_base` — the KB articles/snippets the AI grounds on (title, body,
 *                        tags, scope). A per-tenant catalog with the standard
 *                        soft-delete + trash/restore/purge contract.
 *   - `tenant_settings` — a per-tenant key/value config store for compliance flags
 *                         + misc settings the facade reads/writes (one row per key).
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` is a plain text soft ref; integrity is enforced
 *    in the service layer, never the DB.
 *  - Grain = TENANT: every table carries `tenant_id text not null` + a `*_tenant_idx`,
 *    read/written wrapped in `withTenant`.
 *  - Every entity has `id`, `created_at`, `updated_at`, nullable `deleted_at`
 *    (SOFT DELETE). Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION (important): the legacy prototype `lib/db/schema.ts`
 * already defines `pgTable("kb")` and a per-platform `platform_setting`. Two
 * pgTable calls with the same SQL name in one merged drizzle client generate
 * conflicting DDL, so this module uses the DISTINCT SQL names `knowledge_base`
 * and `tenant_settings` (a tenant-grain k/v, distinct from the global
 * `platform_setting`/`platform_setting_v2`). The live Neon DB is NOT touched this
 * tick (db:generate only).
 */

// ── knowledge_base (TENANT — KB articles/snippets the AI grounds on) ─────────
// One row per article/snippet. `scope` buckets where the AI should reach for it
// (general | product | objection | compliance | persona). `tags` are free-form
// labels for retrieval/filtering. `pinned` floats high-signal entries to the top.
export const knowledgeBaseTable = pgTable(
  "knowledge_base",
  {
    id: text("id").primaryKey(), // kb_…
    tenantId: text("tenant_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(), // the article / snippet content (plain text or markdown)
    scope: text("scope").notNull().default("general"), // general|product|objection|compliance|persona
    tags: jsonb("tags").$type<string[]>().notNull().default([]), // free-form retrieval labels
    pinned: boolean("pinned").notNull().default(false), // float to the top of retrieval
    sort: integer("sort").notNull().default(0), // display / tie-break order
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("knowledge_base_tenant_idx").on(t.tenantId),
    scopeIdx: index("knowledge_base_scope_idx").on(t.tenantId, t.scope),
  }),
);

// ── tenant_settings (TENANT — per-tenant key/value config) ───────────────────
// One row per (tenant, key). `value` is a JSON blob so a setting can be a flag,
// a string, or a small object (e.g. compliance toggles, retention window). The
// facade groups settings by `category` (compliance | misc). Unique on
// (tenant_id, key) so the upsert is idempotent. Soft-delete is supported, though
// settings are usually upserted-in-place rather than trashed.
export const tenantSettingsTable = pgTable(
  "tenant_settings",
  {
    id: text("id").primaryKey(), // tst_…
    tenantId: text("tenant_id").notNull(),
    key: text("key").notNull(), // e.g. "compliance.dsar_auto", "misc.timezone"
    value: jsonb("value").$type<unknown>(), // flag | string | small object
    category: text("category").notNull().default("misc"), // compliance|misc
    label: text("label"), // optional human label for the UI
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("tenant_settings_tenant_idx").on(t.tenantId),
    // A setting `key` is unique per tenant (idempotent upsert + dedup).
    keyUq: uniqueIndex("tenant_settings_key_uq").on(t.tenantId, t.key),
    categoryIdx: index("tenant_settings_category_idx").on(t.tenantId, t.category),
  }),
);

export type KnowledgeBaseRow = typeof knowledgeBaseTable.$inferSelect;
export type KnowledgeBaseInsert = typeof knowledgeBaseTable.$inferInsert;
export type TenantSettingsRow = typeof tenantSettingsTable.$inferSelect;
export type TenantSettingsInsert = typeof tenantSettingsTable.$inferInsert;
