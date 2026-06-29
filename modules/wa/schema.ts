import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Module 4 · wa (WhatsApp transport) domain schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: the gateway-agnostic WhatsApp transport state. The backend only
 * QUEUES + READS; an EXTERNAL gateway (a browser extension or a WAHA instance)
 * is the actual transport — OUT OF SCOPE here. Owns two tables:
 *   - `wa_session_v2` — one connection per rep/account. Holds the `status`
 *                       (idle|qr|connecting|connected|disconnected), the QR/pairing
 *                       payload, the connected phone number, and a `last_seen_at`
 *                       heartbeat. The gateway flips this as the device links.
 *   - `wa_outbox_v2`  — a queued OUTBOUND message with a pacing `delay_ms` (so the
 *                       gateway sends human-feeling, throttled bubbles) and a
 *                       `status` (queued|sending|sent|failed|canceled). REPLY-ONLY:
 *                       an outbox row must reference an existing inbound
 *                       conversation (enforced in the service, not the DB).
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — `session_id`, `conversation_id`, `contact_id`, `user_id`,
 *    `message_id` are plain text soft refs; integrity is enforced in the service.
 *  - Grain = TENANT: every table carries `tenant_id text not null` + a
 *    `*_tenant_idx`, read/written wrapped in `withTenant`.
 *  - `wa_session_v2` / `wa_outbox_v2` are operational/queue tables (no soft
 *    delete): a session is `disconnected`, an outbox row is `canceled`/`sent`.
 *    They track lifecycle via their `status` column, not `deleted_at`.
 *
 * NAMING / NON-COLLISION (important): the legacy prototype already has wa state
 * (`wa_session` / `wa_outbox` conceptually, via `lib/wa/*`), so the rebuild tables
 * use the NEW SQL names `wa_session_v2` / `wa_outbox_v2` to coexist without a DDL
 * collision. The live Neon DB is NOT touched this tick (db:generate only).
 */

// ── wa_session_v2 (TENANT — one connection per rep/account) ──────────────────
export const waSessionTable = pgTable(
  "wa_session_v2",
  {
    id: text("id").primaryKey(), // was_…
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id"), // soft ref → app_user.id (per-rep attribution)
    label: text("label"), // human label for the connection
    status: text("status").notNull().default("idle"), // idle|qr|connecting|connected|disconnected
    phoneNumber: text("phone_number"), // the linked WA number (once connected)
    qr: text("qr"), // current QR / pairing payload (gateway-written)
    gateway: text("gateway").notNull().default("extension"), // extension|waha (transport hint)
    meta: jsonb("meta").$type<Record<string, unknown>>(), // daily limits, session info, etc.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }), // heartbeat from the gateway
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index("wa_session_v2_tenant_idx").on(t.tenantId),
    userIdx: index("wa_session_v2_user_idx").on(t.tenantId, t.userId),
  }),
);

// ── wa_outbox_v2 (TENANT — queued outbound message; reply-only, paced) ───────
export const waOutboxTable = pgTable(
  "wa_outbox_v2",
  {
    id: text("id").primaryKey(), // wao_…
    tenantId: text("tenant_id").notNull(),
    sessionId: text("session_id"), // soft ref → wa_session_v2.id (which connection sends)
    conversationId: text("conversation_id").notNull(), // soft ref → conversation_v2.id (reply-only)
    contactId: text("contact_id"), // soft ref → contact.id
    messageId: text("message_id"), // soft ref → message_v2.id (the persisted out message)
    toNumber: text("to_number"), // resolved WA number to send to
    body: text("body").notNull(),
    delayMs: integer("delay_ms").notNull().default(0), // pacing delay before send (human-feel)
    status: text("status").notNull().default("queued"), // queued|sending|sent|failed|canceled
    attempts: integer("attempts").notNull().default(0),
    error: text("error"), // last failure reason
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }), // now() + delayMs (send-after)
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index("wa_outbox_v2_tenant_idx").on(t.tenantId),
    statusIdx: index("wa_outbox_v2_status_idx").on(t.tenantId, t.status),
    conversationIdx: index("wa_outbox_v2_conversation_idx").on(t.tenantId, t.conversationId),
    // Pull the next sendable row in scheduled order (gateway poll).
    scheduledIdx: index("wa_outbox_v2_scheduled_idx").on(t.tenantId, t.status, t.scheduledAt),
  }),
);

export type WaSessionRow = typeof waSessionTable.$inferSelect;
export type WaSessionInsert = typeof waSessionTable.$inferInsert;
export type WaOutboxRow = typeof waOutboxTable.$inferSelect;
export type WaOutboxInsert = typeof waOutboxTable.$inferInsert;
