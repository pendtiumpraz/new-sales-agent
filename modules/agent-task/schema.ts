import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * agent_task — the BYOA (bring-your-own-agent) generation queue (Fase 2).
 *
 * DOMAIN: when a tenant runs in `byoa` mode, the platform does NOT call its own
 * LLM (DeepSeek) for a generation. Instead it ENQUEUES a task here; the tenant's
 * own agent — authenticated with the Fase-1 write-scope API key (`msk_live_…`) —
 * POLLS this queue (`/api/agent/tasks/claim`), generates with ITS OWN model, and
 * POSTs the result back (`/api/agent/tasks/[id]/result`). `submitResult` then
 * DISPATCHES on `type` to apply the completed work (finish the autopilot run,
 * classify the contact, …).
 *
 * A task moves `queued → claimed → done|failed`. `claim` flips the oldest N queued
 * rows atomically (UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)) so two
 * pollers never grab the same task.
 *
 * Conventions (see modules/notification/schema.ts, modules/apikey/schema.ts):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` / ref is a plain text soft ref; integrity in-app.
 *  - `tenant_id` + tenant-isolation RLS (enabled+FORCED in the migration, granted to
 *    the NOBYPASSRLS `app_user` role by scripts/migrate-agent-task.mts).
 *  - SOFT DELETE via nullable `deleted_at`; live reads filter `deleted_at IS NULL`.
 */
export const agentTaskTable = pgTable(
  "agent_task",
  {
    id: text("id").primaryKey(), // atsk_…
    tenantId: text("tenant_id").notNull(),
    type: text("type").notNull(), // draft_reply|classify|generate_quote|generate
    status: text("status").notNull().default("queued"), // queued|claimed|done|failed
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}), // generation input/context
    result: jsonb("result").$type<Record<string, unknown>>(), // nullable — filled on done
    error: text("error"), // nullable — filled on failed
    refType: text("ref_type"), // nullable — what this feeds (e.g. "autopilot_run")
    refId: text("ref_id"), // nullable — the fed row's id
    claimedBy: text("claimed_by"), // nullable — key/agent (stamped from ctx on claim)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    // Claim path: scope by tenant + status (queued) then order by created_at.
    statusIdx: index("agent_task_tenant_status_idx").on(t.tenantId, t.status),
    // Newest/oldest-first ordering within a tenant (claim FIFO + debug list).
    createdIdx: index("agent_task_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export type AgentTaskRow = typeof agentTaskTable.$inferSelect;
export type AgentTaskInsert = typeof agentTaskTable.$inferInsert;

export type AgentTaskType = "draft_reply" | "classify" | "generate_quote" | "generate";
export type AgentTaskStatus = "queued" | "claimed" | "done" | "failed";
