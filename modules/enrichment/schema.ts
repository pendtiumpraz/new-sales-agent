import {
  pgTable,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Module 5 · enrichment / discovery domain schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: lead discovery + profile enrichment. Owns three tables:
 *   - `discovery_job`    — a search/crawl RUN: a `query` + `channel`/`source`, a
 *                          lifecycle `status` (pending|running|done|error), a
 *                          `results_count` rollup, and a `workspace_id` (a job
 *                          targets one sales focus). Optional `posture` + `origin`.
 *   - `discovery_result` — a single RAW lead a job found (name/company/title +
 *                          contact handles + a `source_url`). It is SAVABLE into a
 *                          workspace (`saved_at` / `saved_contact_id`) — saving an
 *                          unenriched result hands it to the enrich queue.
 *   - `enrichment_record`— the enriched PROFILE for a contact: the filled fields
 *                          (`fields` jsonb) + their `source`, a `classification`
 *                          (b2c|b2b|unknown), a `fit_score` (0..1) and `fit_reason`,
 *                          a `status` (queued|running|enriched|failed), and the
 *                          `pushed_contact_id` once it lands on a CRM contact.
 *
 * The CLASSIFY step decides B2C/B2B + fit_score (heuristic now; AI later in M6).
 * PUSH-to-contact creates/updates a CRM `contact` (through `crmService`, the OWNING
 * module — modular-monolith rule) setting its `segment` + `enrichment_status` +
 * `fit_score`. This module FILLS those CRM fields; it never reaches CRM tables.
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` (workspace_id, job_id, contact_id,
 *    saved_contact_id, pushed_contact_id, result_id) is a plain text soft ref;
 *    integrity is enforced in the service layer, never the DB.
 *  - Grain = TENANT: every table carries `tenant_id text not null` + a
 *    `*_tenant_idx`, and is read/written wrapped in `withTenant`. Jobs/results are
 *    additionally scoped by `workspace_id` IN-APP (no FK).
 *  - Every entity has `id`, `created_at`, `updated_at`, nullable `deleted_at`
 *    (SOFT DELETE). Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION (important): the legacy prototype `lib/db/schema.ts`
 * already defines `pgTable("crawl_job")` and `pgTable("ingest_batch")` for its
 * discovery/ingest runs. The rebuild's run/result/record tables have NO legacy
 * twin (the names below do NOT collide with `crawl_job`/`ingest_batch`), so they
 * get clean singular names — no `_v2` suffix needed. The live Neon DB is NOT
 * touched this tick (db:generate only).
 */

// ── discovery_job (TENANT + workspace-scoped — a search/crawl run) ───────────
export const discoveryJobTable = pgTable(
  "discovery_job",
  {
    id: text("id").primaryKey(), // dsj_…
    tenantId: text("tenant_id").notNull(),
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id (sales focus)
    query: text("query").notNull(), // the search term / seed
    channel: text("channel").notNull().default("web"), // web|linkedin|instagram|maps|directory
    source: text("source"), // engine / provider used (e.g. startpage, hunter)
    status: text("status").notNull().default("pending"), // pending|running|done|error
    posture: text("posture").notNull().default("compliant"), // compliant|balanced|aggressive
    origin: text("origin"), // manual|mcp|extension
    resultsCount: integer("results_count").notNull().default(0), // rollup of saved results
    // Per-run rollup of NEW graph nodes an ingest flush created (0051): how many
    // companies + contacts THIS batch produced — surfaced in the Enrichment Riwayat.
    // Web-discovery (runDiscovery) jobs leave these 0 and use results_count instead.
    companiesCreated: integer("companies_created").notNull().default(0),
    contactsCreated: integer("contacts_created").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("discovery_job_tenant_idx").on(t.tenantId),
    workspaceIdx: index("discovery_job_workspace_idx").on(t.tenantId, t.workspaceId),
    statusIdx: index("discovery_job_status_idx").on(t.tenantId, t.status),
  }),
);

// ── discovery_result (TENANT — a raw lead found by a job, savable to a ws) ────
// Carries the raw fields a discovery run extracted plus a `saved_at` /
// `saved_contact_id` once the rep saves it into a workspace (which hands it to
// the enrich queue). All refs are soft (no FK).
export const discoveryResultTable = pgTable(
  "discovery_result",
  {
    id: text("id").primaryKey(), // dsr_…
    tenantId: text("tenant_id").notNull(),
    jobId: text("job_id").notNull(), // soft ref → discovery_job.id
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id (inherited from job)
    fullName: text("full_name"), // person name (null for company-only hits)
    companyName: text("company_name"),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    location: text("location"),
    website: text("website"),
    socials: jsonb("socials").$type<Record<string, string>>(), // linkedin/instagram/…
    snippet: text("snippet"), // raw text excerpt the extractor read
    sourceUrl: text("source_url"), // provenance
    raw: jsonb("raw").$type<Record<string, unknown>>(), // full captured payload
    savedAt: timestamp("saved_at", { withTimezone: true }), // when saved to a workspace
    savedContactId: text("saved_contact_id"), // soft ref → contact.id (once saved)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("discovery_result_tenant_idx").on(t.tenantId),
    jobIdx: index("discovery_result_job_idx").on(t.tenantId, t.jobId),
    workspaceIdx: index("discovery_result_workspace_idx").on(t.tenantId, t.workspaceId),
  }),
);

// ── enrichment_record (TENANT — the enriched profile for a contact) ──────────
// One enrichment record per contact: the filled `fields`, the `source`, a
// `classification` (b2c|b2b|unknown) + `fit_score` (0..1) decided by the classify
// step, a lifecycle `status`, and the `pushed_contact_id` once it's pushed to CRM.
export const enrichmentRecordTable = pgTable(
  "enrichment_record",
  {
    id: text("id").primaryKey(), // enr_…
    tenantId: text("tenant_id").notNull(),
    contactId: text("contact_id"), // soft ref → contact.id (the subject; null until pushed)
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id (sales focus)
    resultId: text("result_id"), // soft ref → discovery_result.id (provenance, if from discovery)
    fields: jsonb("fields").$type<Record<string, unknown>>().notNull().default({}), // enriched fields
    source: text("source"), // where the enriched data came from
    classification: text("classification").notNull().default("unknown"), // b2c|b2b|unknown
    fitScore: real("fit_score"), // 0..1 product-fit (classify step)
    fitReason: text("fit_reason"), // why this classification / fit
    status: text("status").notNull().default("queued"), // queued|running|enriched|failed
    error: text("error"),
    pushedContactId: text("pushed_contact_id"), // soft ref → contact.id (once pushed to CRM)
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("enrichment_record_tenant_idx").on(t.tenantId),
    contactIdx: index("enrichment_record_contact_idx").on(t.tenantId, t.contactId),
    workspaceIdx: index("enrichment_record_workspace_idx").on(t.tenantId, t.workspaceId),
    statusIdx: index("enrichment_record_status_idx").on(t.tenantId, t.status),
  }),
);

export type DiscoveryJobRow = typeof discoveryJobTable.$inferSelect;
export type DiscoveryJobInsert = typeof discoveryJobTable.$inferInsert;
export type DiscoveryResultRow = typeof discoveryResultTable.$inferSelect;
export type DiscoveryResultInsert = typeof discoveryResultTable.$inferInsert;
export type EnrichmentRecordRow = typeof enrichmentRecordTable.$inferSelect;
export type EnrichmentRecordInsert = typeof enrichmentRecordTable.$inferInsert;
