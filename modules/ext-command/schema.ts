import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * extension_command — the platform/agent → browser-extension COMMAND queue
 * (Fase 3, PART A "DRIVE").
 *
 * DOMAIN: an authorized agent (write-scope API key, Fase 1) can DRIVE a tenant's
 * installed browser extension remotely — tell it to crawl a channel, deep-enrich,
 * or stop. The platform ENQUEUES a command here; the extension (authenticated with
 * its PER-REP ingest token, same as heartbeat/ingest — NOT the API key) POLLS the
 * queue (`GET /api/extension/commands`), CLAIMS the oldest N, runs the matching
 * RPA scraper in the rep's own logged-in browser, and REPORTS the result back
 * (`POST /api/extension/commands/[id]/result`). Crawl output lands in the CRM via
 * the normal `/api/ingest` sink — this table only carries the command lifecycle.
 *
 * A command moves `queued → claimed → done|failed`. `claim` flips the oldest N
 * queued rows atomically (UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED))
 * so two pollers never grab the same command.
 *
 * `target_user_id` NULL = any rep in the tenant may claim it; set = only that rep
 * (so an agent can address a specific sales rep's browser). The claim filters
 * `target_user_id IS NULL OR target_user_id = <polling rep's userId>`.
 *
 * Conventions (see modules/agent-task/schema.ts, modules/apikey/schema.ts):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` / ref is a plain text soft ref; integrity in-app.
 *  - `tenant_id` + tenant-isolation RLS (enabled+FORCED in the migration, granted to
 *    the NOBYPASSRLS `app_user` role by scripts/migrate-ext-command.mts).
 *  - SOFT DELETE via nullable `deleted_at`; live reads filter `deleted_at IS NULL`.
 */
export const extensionCommandTable = pgTable(
  "extension_command",
  {
    id: text("id").primaryKey(), // xcmd_…
    tenantId: text("tenant_id").notNull(),
    targetUserId: text("target_user_id"), // nullable — null = any rep in the tenant
    type: text("type").notNull(), // crawl|enrich|stop
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}), // {channel,query,workspaceId,limit}
    status: text("status").notNull().default("queued"), // queued|claimed|done|failed
    result: jsonb("result").$type<Record<string, unknown>>(), // nullable — filled on done
    error: text("error"), // nullable — filled on failed
    claimedBy: text("claimed_by"), // nullable — the rep user id that claimed it
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    // Claim path: scope by tenant + status (queued) then order by created_at.
    statusIdx: index("extension_command_tenant_status_idx").on(t.tenantId, t.status),
    // Oldest-first ordering within a tenant (claim FIFO + debug list).
    createdIdx: index("extension_command_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export type ExtensionCommandRow = typeof extensionCommandTable.$inferSelect;
export type ExtensionCommandInsert = typeof extensionCommandTable.$inferInsert;

export type ExtensionCommandType = "crawl" | "enrich" | "stop";
export type ExtensionCommandStatus = "queued" | "claimed" | "done" | "failed";
