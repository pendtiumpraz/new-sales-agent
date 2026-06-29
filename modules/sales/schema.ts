import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Module 6 · sales / closing-flow domain schema (rebuild — REAL backend, the
 * differentiator). Owns three tables:
 *
 *   - `conversation_stage`  — per conversation (1:1): where the chat is in the
 *                             closing flow (`stage`: rapport|discovery|value|
 *                             objection|closing) plus the detected `signals`
 *                             (need/value/price/objection/closing-intent) that
 *                             justified it. Driven by a DETERMINISTIC stage-machine
 *                             (heuristic, no AI cost); AI may refine it but the
 *                             heuristic always works with NO keys.
 *   - `closing_readiness`   — per conversation (1:1): a 0..100 readiness `score`,
 *                             a `band` (cold|warm|hot), the `factors` that drove
 *                             it, and a next-best-action (`nba_action` + suggestion).
 *                             Heuristic scorer over the stage + signals.
 *   - `kb_technique`        — the 17 Teknik Closing catalog (per tenant): `key`,
 *                             `name`, `inti` (how it works), `contoh` (sample line),
 *                             `cocok_untuk` (b2b/b2c market fit), `sinyal` (trigger
 *                             signals). Seeded from the shared 17-technique data;
 *                             tenants can add/override/soft-delete their own.
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` (conversation_id, workspace_id) is a plain
 *    text soft ref; integrity is enforced in the service layer, never the DB.
 *  - Grain = TENANT: every table carries `tenant_id text not null` + a
 *    `*_tenant_idx`, read/written wrapped in `withTenant`. The stage + readiness
 *    rows are additionally scoped by `conversation_id` (1:1, unique per tenant)
 *    and carry the `workspace_id` IN-APP (no FK).
 *  - Every entity has `id`, `created_at`, `updated_at`, nullable `deleted_at`
 *    (SOFT DELETE). Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION (important): the legacy prototype `lib/db/schema.ts`
 * already defines `pgTable("kb")`. Two pgTable calls with the same SQL name in
 * one merged drizzle client generate conflicting DDL, so the closing-technique
 * catalog uses the distinct SQL name `kb_technique`. The other two tables
 * (`conversation_stage`, `closing_readiness`) have no legacy twin, so they get
 * clean singular names. The live Neon DB is NOT touched this tick (db:generate
 * only).
 */

// ── conversation_stage (TENANT — 1:1 per conversation) ───────────────────────
// The stage-machine output for a conversation: the current `stage`, the previous
// stage (for transition awareness), the detected `signals` snapshot, the chosen
// `next_action`, and a `source` (heuristic|ai) recording how it was decided.
export const conversationStageTable = pgTable(
  "conversation_stage",
  {
    id: text("id").primaryKey(), // cst_…
    tenantId: text("tenant_id").notNull(),
    conversationId: text("conversation_id").notNull(), // soft ref → conversation_v2.id (1:1)
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id (sales focus)
    stage: text("stage").notNull().default("rapport"), // rapport|discovery|value|objection|closing
    previousStage: text("previous_stage"), // the stage before this transition (null at first)
    nextAction: text("next_action").notNull().default("nurture"), // nurture|gali|value|objection|close|handoff
    signals: jsonb("signals")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}), // {needIdentified,valueDelivered,priceAsked,objection,closingIntent}
    guidance: text("guidance"), // stage-specific instruction (system-prompt snippet)
    source: text("source").notNull().default("heuristic"), // heuristic|ai
    turns: integer("turns").notNull().default(0), // customer turns observed (drives scoring)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("conversation_stage_tenant_idx").on(t.tenantId),
    // 1:1 with a conversation — one live stage row per conversation per tenant.
    conversationUq: uniqueIndex("conversation_stage_conversation_uq").on(
      t.tenantId,
      t.conversationId,
    ),
    workspaceIdx: index("conversation_stage_workspace_idx").on(t.tenantId, t.workspaceId),
  }),
);

// ── closing_readiness (TENANT — 1:1 per conversation) ────────────────────────
// The readiness scorer output for a conversation: a 0..100 `score`, a `band`
// (cold|warm|hot), the human-readable `factors` that drove the score, and the
// next-best-action (`nba_action` + `nba_suggestion`).
export const closingReadinessTable = pgTable(
  "closing_readiness",
  {
    id: text("id").primaryKey(), // crd_…
    tenantId: text("tenant_id").notNull(),
    conversationId: text("conversation_id").notNull(), // soft ref → conversation_v2.id (1:1)
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id
    score: integer("score").notNull().default(0), // 0..100 closing-readiness
    band: text("band").notNull().default("cold"), // cold|warm|hot
    factors: jsonb("factors").$type<string[]>().notNull().default([]), // drivers of the score
    nbaAction: text("nba_action").notNull().default("nurture"), // nurture|gali|value|objection|close|handoff
    nbaSuggestion: text("nba_suggestion"), // human-readable next move
    stage: text("stage"), // the stage this readiness was computed against (denormalized)
    source: text("source").notNull().default("heuristic"), // heuristic|ai
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("closing_readiness_tenant_idx").on(t.tenantId),
    // 1:1 with a conversation — one live readiness row per conversation per tenant.
    conversationUq: uniqueIndex("closing_readiness_conversation_uq").on(
      t.tenantId,
      t.conversationId,
    ),
    bandIdx: index("closing_readiness_band_idx").on(t.tenantId, t.band),
  }),
);

// ── kb_technique (TENANT — the 17 Teknik Closing catalog) ────────────────────
// One row per closing technique. Seeded with the 17 teknik; tenants may add/edit/
// soft-delete their own. `cocok_untuk` tags the market fit (aggressive techniques
// are B2C-only so the B2B path stays consultative). `sinyal` lists the trigger
// signals that should make the closing stage reach for this technique.
export const kbTechniqueTable = pgTable(
  "kb_technique",
  {
    id: text("id").primaryKey(), // tek_…
    tenantId: text("tenant_id").notNull(),
    key: text("key").notNull(), // stable slug, e.g. "now_or_never" (dedup per tenant)
    name: text("name").notNull(), // display, e.g. "Now or Never"
    inti: text("inti").notNull(), // one-line how-it-works
    contoh: text("contoh"), // optional sample line (plain text)
    cocokUntuk: jsonb("cocok_untuk").$type<string[]>().notNull().default([]), // ["b2b","b2c"]
    sinyal: jsonb("sinyal").$type<string[]>().notNull().default([]), // trigger signals
    sort: integer("sort").notNull().default(0), // display order
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("kb_technique_tenant_idx").on(t.tenantId),
    // A technique `key` is unique per tenant (dedup on seed + override).
    keyUq: uniqueIndex("kb_technique_key_uq").on(t.tenantId, t.key),
  }),
);

export type ConversationStageRow = typeof conversationStageTable.$inferSelect;
export type ConversationStageInsert = typeof conversationStageTable.$inferInsert;
export type ClosingReadinessRow = typeof closingReadinessTable.$inferSelect;
export type ClosingReadinessInsert = typeof closingReadinessTable.$inferInsert;
export type KbTechniqueRow = typeof kbTechniqueTable.$inferSelect;
export type KbTechniqueInsert = typeof kbTechniqueTable.$inferInsert;
