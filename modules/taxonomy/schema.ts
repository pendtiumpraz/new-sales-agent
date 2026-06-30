import { pgTable, text, real, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * taxonomy domain schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: the MASTER DATA the AI classifies crawled companies/people into. Two
 * flat catalogs:
 *   - `industry`   — the line of business a COMPANY (or a person's employer) is
 *                    in (LinkedIn-style: "Software Development", "Retail", …).
 *   - `occupation` — the JOB FAMILY a PERSON does ("Sales", "Engineering", …),
 *                    optionally pinned to an `industry_id`.
 *
 * TWO-LEVEL NAMESPACE (the important bit):
 *   - `tenant_id` is NULLABLE. NULL = the GLOBAL CANONICAL BASE shared by every
 *     tenant (seeded once, source="seed"). Non-null = PRIVATE to that tenant
 *     (rows the tenant's AI proposed or an admin typed). A tenant always reads
 *     the UNION (global base ∪ its own rows); it can only WRITE its own.
 *   - A UNIQUE index on (tenant_id, slug) per table guarantees one row per
 *     normalized name PER NAMESPACE. The global namespace (tenant_id NULL) is
 *     deduped too — the migration declares the index `NULLS NOT DISTINCT` so two
 *     global rows with the same slug collide (plain Postgres treats NULLs as
 *     distinct, which would let duplicate globals slip in). See the repo's
 *     `upsertBySlug` for the concurrency-safe insert path.
 *
 * Conventions (match modules/enrichment, modules/sales):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — `parent_id` / `industry_id` are plain text soft refs;
 *    integrity is enforced in the service layer, never the DB.
 *  - Every row has `id`, `created_at`, `updated_at`, nullable `deleted_at`
 *    (SOFT DELETE). Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION: the legacy `lib/db/schema.ts` has no `industry` /
 * `occupation` tables, so these get clean singular names (no `_v2` suffix).
 */

// ── industry (GLOBAL base ∪ TENANT private — a company's line of business) ────
export const industryTable = pgTable(
  "industry",
  {
    id: text("id").primaryKey(), // ind_…
    tenantId: text("tenant_id"), // NULL = global canonical base; non-null = private to that tenant
    name: text("name").notNull(), // display name (Bahasa Indonesia default)
    slug: text("slug").notNull(), // normalized lowercase key (dedup within a namespace)
    parentId: text("parent_id"), // soft ref → industry.id (optional flat hierarchy)
    nameEn: text("name_en"), // bilingual English label
    source: text("source").notNull().default("seed"), // seed|ai|manual
    confidence: real("confidence"), // 0..1 — set when source="ai"
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("industry_tenant_idx").on(t.tenantId),
    // One row per slug per namespace. NULLS NOT DISTINCT (declared in the
    // migration) folds all global rows (tenant_id NULL) into one namespace so
    // the canonical base is deduped too.
    slugUq: uniqueIndex("industry_tenant_slug_uq").on(t.tenantId, t.slug),
  }),
);

// ── occupation (GLOBAL base ∪ TENANT private — a person's job family) ─────────
export const occupationTable = pgTable(
  "occupation",
  {
    id: text("id").primaryKey(), // occ_…
    tenantId: text("tenant_id"), // NULL = global canonical base; non-null = private to that tenant
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    parentId: text("parent_id"), // soft ref → occupation.id (optional flat hierarchy)
    industryId: text("industry_id"), // soft ref → industry.id (job family's typical industry)
    nameEn: text("name_en"),
    source: text("source").notNull().default("seed"), // seed|ai|manual
    confidence: real("confidence"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("occupation_tenant_idx").on(t.tenantId),
    industryIdx: index("occupation_industry_idx").on(t.tenantId, t.industryId),
    slugUq: uniqueIndex("occupation_tenant_slug_uq").on(t.tenantId, t.slug),
  }),
);

export type IndustryRow = typeof industryTable.$inferSelect;
export type IndustryInsert = typeof industryTable.$inferInsert;
export type OccupationRow = typeof occupationTable.$inferSelect;
export type OccupationInsert = typeof occupationTable.$inferInsert;

/** The two taxonomy kinds — used by the service's `classify` discriminator. */
export type TaxonomyKind = "industry" | "occupation";
