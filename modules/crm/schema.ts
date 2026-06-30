import {
  pgTable,
  text,
  integer,
  real,
  jsonb,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Module 3 · crm domain schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: first-class CRM. Owns six tables:
 *   - `company_v2`      — the organisation (account).
 *   - `contact`         — the person/lead. Carries a `segment` (b2c|b2b|unknown),
 *                         `enrichment_status`, `fit_score`, and a `workspace_id`
 *                         (a contact belongs to a workspace / sales focus).
 *   - `pipeline`        — a named board (one per workspace or product line).
 *   - `pipeline_stage`  — ordered columns of a pipeline (config per tenant/ws).
 *   - `deal`            — an opportunity in one pipeline at one stage, with value.
 *   - `activity`        — a timeline note/event linked to a contact / deal / company.
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` (company_id, workspace_id, contact_id,
 *    pipeline_id, stage_id, …) is a plain text soft ref; integrity is enforced in
 *    the service layer, never the DB.
 *  - Grain = TENANT: every table carries `tenant_id text not null` + a
 *    `*_tenant_idx`, and is read/written wrapped in `withTenant`. Contacts are
 *    additionally scoped by `workspace_id` IN-APP (no FK).
 *  - Every entity has `id`, `created_at`, `updated_at`, nullable `deleted_at`
 *    (SOFT DELETE). Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION (important): the legacy prototype `lib/db/schema.ts`
 * already defines `pgTable("company")` (and `contacts`/`deals`/`person`) with the
 * OLD shapes. Two pgTable calls with the same SQL name in one merged drizzle
 * client generate conflicting DDL, so the colliding rebuild table uses the NEW
 * SQL name `company_v2` — the same `_v2` precedent M1/M2 used for
 * `workspace_v2` / `product_v2` / `audit_log_v2`. The other CRM tables
 * (`contact`, `pipeline`, `pipeline_stage`, `deal`, `activity`) have NO legacy
 * twin (legacy uses the PLURAL `contacts`/`deals`), so they get clean singular
 * names. The live Neon DB is NOT touched this tick (db:generate only).
 */

// ── company_v2 (TENANT — the organisation / account) ─────────────────────────
export const companyTable = pgTable(
  "company_v2",
  {
    id: text("id").primaryKey(), // cmp_…
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    domain: text("domain"), // dedup key (normalized)
    industry: text("industry"), // free-text label (as captured)
    industryId: text("industry_id"), // soft ref → industry.id (taxonomy classify-on-enrich)
    size: text("size"),
    hqCountry: text("hq_country"),
    hqCity: text("hq_city"),
    website: text("website"),
    summary: text("summary"),
    techStack: jsonb("tech_stack").$type<string[]>().notNull().default([]),
    socials: jsonb("socials").$type<Record<string, string>>(),
    ownerUserId: text("owner_user_id"), // soft ref → app_user.id
    status: text("status").notNull().default("active"),
    source: text("source"), // provenance (enrichment)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("company_v2_tenant_idx").on(t.tenantId),
    domainIdx: index("company_v2_domain_idx").on(t.tenantId, t.domain),
    industryIdx: index("company_v2_industry_idx").on(t.tenantId, t.industryId),
  }),
);

// ── contact (TENANT + workspace-scoped — the person / lead) ──────────────────
// A contact carries the REQUIRED `segment` (b2c|b2b|unknown), an
// `enrichment_status`, a `fit_score`, and a `workspace_id` (it belongs to a
// workspace / sales focus). All refs are soft (no FK).
export const contactTable = pgTable(
  "contact",
  {
    id: text("id").primaryKey(), // ctc_…
    tenantId: text("tenant_id").notNull(),
    companyId: text("company_id"), // soft ref → company_v2.id
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id (scopes lead to a sales focus)
    fullName: text("full_name").notNull(),
    title: text("title"),
    occupationId: text("occupation_id"), // soft ref → occupation.id (taxonomy classify-on-enrich)
    department: text("department"),
    seniority: text("seniority"),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    city: text("city"),
    location: text("location"),
    channelPreference: text("channel_preference"),
    socials: jsonb("socials").$type<Record<string, string>>(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    // REQUIRED segment classification (b2c customer | b2b partner | unknown).
    segment: text("segment").notNull().default("unknown"), // b2c|b2b|unknown
    // Enrichment lifecycle: how complete/verified this contact's profile is.
    enrichmentStatus: text("enrichment_status").notNull().default("none"), // none|pending|enriched|failed
    // Product-fit score (0..1) — how well this lead matches the workspace ICP.
    fitScore: real("fit_score"),
    fitReason: text("fit_reason"), // why this fit/classification
    lifecycleStage: text("lifecycle_stage").notNull().default("lead"), // lead|mql|sql|customer|churned
    ownerUserId: text("owner_user_id"), // soft ref → app_user.id (assigned rep)
    consentStatus: text("consent_status").notNull().default("unknown"), // unknown|legitimate_interest|opted_in|opted_out
    source: text("source"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    avatarColor: text("avatar_color"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("contact_tenant_idx").on(t.tenantId),
    companyIdx: index("contact_company_idx").on(t.tenantId, t.companyId),
    occupationIdx: index("contact_occupation_idx").on(t.tenantId, t.occupationId),
    workspaceIdx: index("contact_workspace_idx").on(t.tenantId, t.workspaceId),
    ownerIdx: index("contact_owner_idx").on(t.tenantId, t.ownerUserId),
    // Partial index matching the live-read shape (list/keyset paginate the
    // newest live contacts): `WHERE deleted_at IS NULL` so soft-deleted rows
    // don't bloat the index or erode tenant selectivity.
    liveIdx: index("contact_live_idx")
      .on(t.tenantId, t.createdAt.desc(), t.id.desc())
      .where(sql`${t.deletedAt} is null`),
  }),
);

// ── pipeline (TENANT — a named board, config per tenant/workspace) ───────────
export const pipelineTable = pgTable(
  "pipeline",
  {
    id: text("id").primaryKey(), // ppl_…
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id (optional scope)
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("pipeline_tenant_idx").on(t.tenantId),
    workspaceIdx: index("pipeline_workspace_idx").on(t.tenantId, t.workspaceId),
  }),
);

// ── pipeline_stage (TENANT — ordered columns of a pipeline) ──────────────────
export const pipelineStageTable = pgTable(
  "pipeline_stage",
  {
    id: text("id").primaryKey(), // stg_…
    tenantId: text("tenant_id").notNull(),
    pipelineId: text("pipeline_id").notNull(), // soft ref → pipeline.id
    name: text("name").notNull(), // prospek|kualifikasi|penawaran|negosiasi|tutup
    sort: integer("sort").notNull().default(0), // column order
    probability: integer("probability"), // 0..100 default win prob (forecasting)
    isWon: boolean("is_won").notNull().default(false), // terminal won
    isLost: boolean("is_lost").notNull().default(false), // terminal lost
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("pipeline_stage_tenant_idx").on(t.tenantId),
    pipelineIdx: index("pipeline_stage_pipeline_idx").on(t.tenantId, t.pipelineId),
  }),
);

// ── deal (TENANT — an opportunity in one pipeline at one stage, with value) ───
export const dealTable = pgTable(
  "deal",
  {
    id: text("id").primaryKey(), // deal_…
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    pipelineId: text("pipeline_id"), // soft ref → pipeline.id
    stageId: text("stage_id"), // soft ref → pipeline_stage.id
    contactId: text("contact_id"), // soft ref → contact.id
    companyId: text("company_id"), // soft ref → company_v2.id
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id
    productId: text("product_id"), // soft ref → product_v2.id
    value: real("value").notNull().default(0),
    currency: text("currency").notNull().default("IDR"),
    status: text("status").notNull().default("open"), // open|won|lost
    expectedClose: text("expected_close"), // ISO date string
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
    sourceChannel: text("source_channel"),
    ownerUserId: text("owner_user_id"), // soft ref → app_user.id
    avatarColor: text("avatar_color"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("deal_tenant_idx").on(t.tenantId),
    stageIdx: index("deal_stage_idx").on(t.tenantId, t.stageId),
    contactIdx: index("deal_contact_idx").on(t.tenantId, t.contactId),
    pipelineIdx: index("deal_pipeline_idx").on(t.tenantId, t.pipelineId),
    // Partial index matching the live-read shape (list/keyset paginate the
    // newest live deals) — soft-deleted rows excluded.
    liveIdx: index("deal_live_idx")
      .on(t.tenantId, t.createdAt.desc(), t.id.desc())
      .where(sql`${t.deletedAt} is null`),
  }),
);

// ── activity (TENANT — timeline note/event on a contact / deal / company) ─────
export const activityTable = pgTable(
  "activity",
  {
    id: text("id").primaryKey(), // act_…
    tenantId: text("tenant_id").notNull(),
    subjectType: text("subject_type").notNull(), // contact|company|deal (polymorphic owner)
    subjectId: text("subject_id").notNull(), // soft ref to the subject
    type: text("type").notNull(), // call|email|meeting|whatsapp|task|note|stage_change
    title: text("title"),
    body: text("body"),
    dueAt: timestamp("due_at", { withTimezone: true }), // for tasks
    doneAt: timestamp("done_at", { withTimezone: true }),
    actorUserId: text("actor_user_id"), // soft ref → app_user.id
    meta: jsonb("meta").$type<Record<string, unknown>>(), // structured payload (e.g. old/new stage)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("activity_tenant_idx").on(t.tenantId),
    subjectIdx: index("activity_subject_idx").on(t.tenantId, t.subjectType, t.subjectId),
    // Partial index matching the live-read shape: a subject's live activities
    // newest-first (timeline) + the tenant-wide newest-first list. Soft-deleted
    // rows excluded; the cascade reads also probe by subject under this filter.
    liveSubjectIdx: index("activity_live_subject_idx")
      .on(t.tenantId, t.subjectType, t.subjectId, t.createdAt.desc())
      .where(sql`${t.deletedAt} is null`),
  }),
);

export type CompanyRow = typeof companyTable.$inferSelect;
export type CompanyInsert = typeof companyTable.$inferInsert;
export type ContactRow = typeof contactTable.$inferSelect;
export type ContactInsert = typeof contactTable.$inferInsert;
export type PipelineRow = typeof pipelineTable.$inferSelect;
export type PipelineInsert = typeof pipelineTable.$inferInsert;
export type PipelineStageRow = typeof pipelineStageTable.$inferSelect;
export type PipelineStageInsert = typeof pipelineStageTable.$inferInsert;
export type DealRow = typeof dealTable.$inferSelect;
export type DealInsert = typeof dealTable.$inferInsert;
export type ActivityRow = typeof activityTable.$inferSelect;
export type ActivityInsert = typeof activityTable.$inferInsert;
