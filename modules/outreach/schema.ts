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
 * Module 7 · outreach domain schema (rebuild — REAL backend). Owns the follow-up
 * automation surface: cadences (named sequences), their ordered steps, per-contact
 * enrollments that walk the steps, AI auto-orchestration runs, and the human
 * escalation + handoff queue. Six tables:
 *
 *   - `cadence_v2`            — a named follow-up SEQUENCE (e.g. "Outbound 5-touch").
 *                              Scoped to a workspace IN-APP (no FK). `status`
 *                              active|paused|archived; `step_count` denormalized for
 *                              list rendering.
 *   - `cadence_step_v2`       — the ORDERED steps of a cadence: `channel` (wa|email|
 *                              call), a `delay_hours` wait before this step fires,
 *                              and the message `template` (+ optional `subject` for
 *                              email). `sort` is the 0-based order within a cadence.
 *   - `cadence_enrollment_v2` — a CONTACT enrolled in a cadence: the `current_step`
 *                              index, a `status` (active|paused|completed|stopped),
 *                              the `next_run_at` due-time the processor reads, and a
 *                              `last_step_at`. 1:1 per (cadence, contact) when active.
 *   - `autopilot_run_v2`      — an AI auto-orchestration RUN over a conversation /
 *                              contact: `mode` (suggest|auto), `status` (queued|
 *                              running|done|error|escalated), a structured `log`
 *                              (step trace) and a free-text `summary` / `error`.
 *   - `escalation`            — a CONVERSATION escalated to a human: the `reason`
 *                              (objection|pricing|complaint|low_confidence|manual|
 *                              policy), `status` (open|acknowledged|resolved|
 *                              dismissed), `priority`, and who it was raised by /
 *                              assigned to (soft refs).
 *   - `handoff`               — a QUEUE item for human takeover: links a conversation
 *                              (and optional escalation) to an assignee, with a
 *                              `status` (pending|claimed|done|cancelled) and SLA
 *                              `due_at`. The work-queue the rep UI drains.
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` (workspace_id, contact_id, cadence_id,
 *    conversation_id, …) is a plain text soft ref; integrity is enforced in the
 *    service layer, never the DB.
 *  - Grain = TENANT: every table carries `tenant_id text not null` + a
 *    `*_tenant_idx`, read/written wrapped in `withTenant`. Rows are additionally
 *    scoped by `workspace_id` / `contact_id` / `conversation_id` IN-APP (no FK).
 *  - Every entity has `id`, `created_at`, `updated_at`, nullable `deleted_at`
 *    (SOFT DELETE). Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION (important): the legacy prototype `lib/db/schema.ts`
 * already defines `cadences`, `cadence_enrollments`, `cadence_step_run`, and
 * `autopilot_runs`. Two pgTable calls with the same SQL name in one merged drizzle
 * client generate conflicting DDL, so the rebuild tables that have a legacy twin
 * carry a `_v2` suffix (`cadence_v2`, `cadence_step_v2`, `cadence_enrollment_v2`,
 * `autopilot_run_v2`). `escalation` + `handoff` have no legacy twin, so they get
 * clean singular names. The live Neon DB is NOT touched this tick (db:generate
 * only).
 */

// ── cadence_v2 (TENANT — a named follow-up sequence) ─────────────────────────
export const cadenceTable = pgTable(
  "cadence_v2",
  {
    id: text("id").primaryKey(), // cad_…
    tenantId: text("tenant_id").notNull(),
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id (sales focus)
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"), // active|paused|archived
    stepCount: integer("step_count").notNull().default(0), // denormalized for list rendering
    createdBy: text("created_by"), // soft ref → app_user.id
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("cadence_v2_tenant_idx").on(t.tenantId),
    workspaceIdx: index("cadence_v2_workspace_idx").on(t.tenantId, t.workspaceId),
  }),
);

// ── cadence_step_v2 (TENANT — ordered steps of a cadence) ────────────────────
export const cadenceStepTable = pgTable(
  "cadence_step_v2",
  {
    id: text("id").primaryKey(), // cds_…
    tenantId: text("tenant_id").notNull(),
    cadenceId: text("cadence_id").notNull(), // soft ref → cadence_v2.id
    sort: integer("sort").notNull().default(0), // 0-based order within the cadence
    channel: text("channel").notNull().default("wa"), // wa|email|call
    delayHours: integer("delay_hours").notNull().default(0), // wait before this step fires
    subject: text("subject"), // email subject (email channel only)
    template: text("template").notNull().default(""), // message body / call script
    meta: jsonb("meta").$type<Record<string, unknown>>(), // step-specific extras
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("cadence_step_v2_tenant_idx").on(t.tenantId),
    cadenceIdx: index("cadence_step_v2_cadence_idx").on(t.tenantId, t.cadenceId),
  }),
);

// ── cadence_enrollment_v2 (TENANT — a contact walking a cadence) ─────────────
export const cadenceEnrollmentTable = pgTable(
  "cadence_enrollment_v2",
  {
    id: text("id").primaryKey(), // cen_…
    tenantId: text("tenant_id").notNull(),
    cadenceId: text("cadence_id").notNull(), // soft ref → cadence_v2.id
    contactId: text("contact_id").notNull(), // soft ref → contact.id
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id (denormalized)
    conversationId: text("conversation_id"), // soft ref → conversation_v2.id (optional)
    assignedUserId: text("assigned_user_id"), // soft ref → app_user.id (owning rep)
    currentStep: integer("current_step").notNull().default(0), // index into the ordered steps
    status: text("status").notNull().default("active"), // active|paused|completed|stopped
    nextRunAt: timestamp("next_run_at", { withTimezone: true }), // due-time the processor reads
    lastStepAt: timestamp("last_step_at", { withTimezone: true }), // when the last step fired
    completedAt: timestamp("completed_at", { withTimezone: true }),
    stopReason: text("stop_reason"), // why it was stopped (replied|opted_out|manual|…)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("cadence_enrollment_v2_tenant_idx").on(t.tenantId),
    cadenceIdx: index("cadence_enrollment_v2_cadence_idx").on(t.tenantId, t.cadenceId),
    contactIdx: index("cadence_enrollment_v2_contact_idx").on(t.tenantId, t.contactId),
    // One LIVE enrollment per (cadence, contact). Re-enrolling after stop reuses
    // the row (upsert clears deleted_at), so the unique key holds across restarts.
    cadenceContactUq: uniqueIndex("cadence_enrollment_v2_cadence_contact_uq").on(
      t.tenantId,
      t.cadenceId,
      t.contactId,
    ),
    dueIdx: index("cadence_enrollment_v2_due_idx").on(t.tenantId, t.status, t.nextRunAt),
  }),
);

// ── autopilot_run_v2 (TENANT — an AI auto-orchestration run) ─────────────────
export const autopilotRunTable = pgTable(
  "autopilot_run_v2",
  {
    id: text("id").primaryKey(), // apr_…
    tenantId: text("tenant_id").notNull(),
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id
    contactId: text("contact_id"), // soft ref → contact.id
    conversationId: text("conversation_id"), // soft ref → conversation_v2.id
    enrollmentId: text("enrollment_id"), // soft ref → cadence_enrollment_v2.id (optional)
    mode: text("mode").notNull().default("suggest"), // suggest|auto
    status: text("status").notNull().default("queued"), // queued|running|done|error|escalated
    trigger: text("trigger"), // what kicked it off (inbound|schedule|manual)
    log: jsonb("log").$type<Array<Record<string, unknown>>>().notNull().default([]), // step trace
    summary: text("summary"), // human-readable outcome
    error: text("error"), // failure detail (status=error)
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("autopilot_run_v2_tenant_idx").on(t.tenantId),
    conversationIdx: index("autopilot_run_v2_conversation_idx").on(t.tenantId, t.conversationId),
    statusIdx: index("autopilot_run_v2_status_idx").on(t.tenantId, t.status),
  }),
);

// ── escalation (TENANT — a conversation escalated to a human) ────────────────
export const escalationTable = pgTable(
  "escalation",
  {
    id: text("id").primaryKey(), // esc_…
    tenantId: text("tenant_id").notNull(),
    conversationId: text("conversation_id").notNull(), // soft ref → conversation_v2.id
    contactId: text("contact_id"), // soft ref → contact.id (denormalized)
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id
    autopilotRunId: text("autopilot_run_id"), // soft ref → autopilot_run_v2.id (origin)
    reason: text("reason").notNull().default("manual"), // objection|pricing|complaint|low_confidence|manual|policy
    detail: text("detail"), // free-text why
    priority: text("priority").notNull().default("normal"), // low|normal|high|urgent
    status: text("status").notNull().default("open"), // open|acknowledged|resolved|dismissed
    raisedBy: text("raised_by"), // soft ref → app_user.id (or "ai")
    assignedUserId: text("assigned_user_id"), // soft ref → app_user.id
    resolutionNote: text("resolution_note"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("escalation_tenant_idx").on(t.tenantId),
    conversationIdx: index("escalation_conversation_idx").on(t.tenantId, t.conversationId),
    statusIdx: index("escalation_status_idx").on(t.tenantId, t.status),
  }),
);

// ── handoff (TENANT — queue item for human takeover) ─────────────────────────
export const handoffTable = pgTable(
  "handoff",
  {
    id: text("id").primaryKey(), // hnd_…
    tenantId: text("tenant_id").notNull(),
    conversationId: text("conversation_id").notNull(), // soft ref → conversation_v2.id
    contactId: text("contact_id"), // soft ref → contact.id (denormalized)
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id
    escalationId: text("escalation_id"), // soft ref → escalation.id (origin, optional)
    reason: text("reason"), // why a human is needed
    note: text("note"), // context for the human
    status: text("status").notNull().default("pending"), // pending|claimed|done|cancelled
    priority: text("priority").notNull().default("normal"), // low|normal|high|urgent
    assignedUserId: text("assigned_user_id"), // soft ref → app_user.id (queue routing)
    claimedBy: text("claimed_by"), // soft ref → app_user.id (who took it)
    dueAt: timestamp("due_at", { withTimezone: true }), // SLA deadline
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("handoff_tenant_idx").on(t.tenantId),
    conversationIdx: index("handoff_conversation_idx").on(t.tenantId, t.conversationId),
    statusIdx: index("handoff_status_idx").on(t.tenantId, t.status),
    assigneeIdx: index("handoff_assignee_idx").on(t.tenantId, t.assignedUserId),
  }),
);

export type CadenceRow = typeof cadenceTable.$inferSelect;
export type CadenceInsert = typeof cadenceTable.$inferInsert;
export type CadenceStepRow = typeof cadenceStepTable.$inferSelect;
export type CadenceStepInsert = typeof cadenceStepTable.$inferInsert;
export type CadenceEnrollmentRow = typeof cadenceEnrollmentTable.$inferSelect;
export type CadenceEnrollmentInsert = typeof cadenceEnrollmentTable.$inferInsert;
export type AutopilotRunRow = typeof autopilotRunTable.$inferSelect;
export type AutopilotRunInsert = typeof autopilotRunTable.$inferInsert;
export type EscalationRow = typeof escalationTable.$inferSelect;
export type EscalationInsert = typeof escalationTable.$inferInsert;
export type HandoffRow = typeof handoffTable.$inferSelect;
export type HandoffInsert = typeof handoffTable.$inferInsert;
