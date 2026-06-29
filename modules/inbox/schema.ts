import {
  pgTable,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Module 4 · inbox domain schema (rebuild — REAL backend, no mock).
 *
 * DOMAIN: the unified, multi-channel (WhatsApp-first) inbox. Owns two tables:
 *   - `conversation_v2` — a thread with one contact, in one workspace, on one
 *                         channel (e.g. `wa`). Carries the `status`, an
 *                         `unread_count`, a `last_message` preview, and a
 *                         `last_message_at` sort key.
 *   - `message_v2`      — a single message inside a conversation. Carries the
 *                         `direction` (in|out), the `body`, a delivery `status`,
 *                         and a `sent_at`. (Kept soft-deletable here so the inbox
 *                         CRUD contract — soft/restore/purge/trashed — is uniform
 *                         across both entities, per the task.)
 *
 * Conventions (see docs/rebuild/06-m1-backend-design.md §Conventions):
 *  - snake_case SQL columns; camelCase Drizzle properties.
 *  - NO foreign keys — every `*_id` (contact_id, workspace_id, conversation_id,
 *    assigned_user_id, channel_account_id) is a plain text soft ref; integrity is
 *    enforced in the service layer, never the DB.
 *  - Grain = TENANT: every table carries `tenant_id text not null` + a
 *    `*_tenant_idx`, and is read/written wrapped in `withTenant`. A conversation
 *    is additionally scoped by `workspace_id` + `contact_id` IN-APP (no FK).
 *  - Every entity has `id`, `created_at`, `updated_at`, nullable `deleted_at`
 *    (SOFT DELETE). Repos filter `deleted_at IS NULL`.
 *
 * NAMING / NON-COLLISION (important): the legacy prototype `lib/db/schema.ts`
 * already defines `pgTable("conversations")` and `pgTable("messages")` with the
 * OLD shapes, and `lib/wa/*` reads them. Two pgTable calls with the same SQL name
 * in one merged drizzle client generate conflicting DDL, so the rebuild tables use
 * the NEW SQL names `conversation_v2` / `message_v2` — the same `_v2` precedent
 * M1/M3 used for `company_v2` / `audit_log_v2`. The live Neon DB is NOT touched
 * this tick (db:generate only).
 */

// ── conversation_v2 (TENANT + workspace/contact-scoped — a thread) ───────────
export const conversationTable = pgTable(
  "conversation_v2",
  {
    id: text("id").primaryKey(), // cnv_…
    tenantId: text("tenant_id").notNull(),
    contactId: text("contact_id").notNull(), // soft ref → contact.id
    workspaceId: text("workspace_id"), // soft ref → workspace_v2.id (sales focus)
    channel: text("channel").notNull().default("wa"), // wa|email|instagram|linkedin
    channelAccountId: text("channel_account_id"), // soft ref → wa_session_v2.id (or other)
    assignedUserId: text("assigned_user_id"), // soft ref → app_user.id (rep attribution)
    lastMessage: text("last_message"), // preview of the latest body
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }), // sort key
    unreadCount: integer("unread_count").notNull().default(0),
    status: text("status").notNull().default("open"), // open|snoozed|closed
    avatarColor: text("avatar_color"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("conversation_v2_tenant_idx").on(t.tenantId),
    contactIdx: index("conversation_v2_contact_idx").on(t.tenantId, t.contactId),
    workspaceIdx: index("conversation_v2_workspace_idx").on(t.tenantId, t.workspaceId),
    lastMsgIdx: index("conversation_v2_last_msg_idx").on(t.tenantId, t.lastMessageAt),
  }),
);

// ── message_v2 (TENANT — a message inside a conversation) ─────────────────────
// `direction` in|out; `body`; delivery `status`; `sent_at`. Carries a denormalized
// `tenant_id` for scoping (no join needed) and the `conversation_id` soft ref.
export const messageTable = pgTable(
  "message_v2",
  {
    id: text("id").primaryKey(), // msg_…
    tenantId: text("tenant_id").notNull(), // denormalized for scoping
    conversationId: text("conversation_id").notNull(), // soft ref → conversation_v2.id
    direction: text("direction").notNull(), // in|out
    body: text("body").notNull(),
    channel: text("channel"), // wa|email|… (mirrors the conversation channel)
    status: text("status").notNull().default("sent"), // queued|sent|delivered|read|failed
    isAiGenerated: boolean("is_ai_generated").notNull().default(false), // auto-reply provenance
    attachmentLabel: text("attachment_label"),
    meta: jsonb("meta").$type<Record<string, unknown>>(), // provider ids, delivery receipts
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete
  },
  (t) => ({
    tenantIdx: index("message_v2_tenant_idx").on(t.tenantId),
    conversationIdx: index("message_v2_conversation_idx").on(
      t.tenantId,
      t.conversationId,
      t.createdAt,
    ),
  }),
);

export type ConversationRow = typeof conversationTable.$inferSelect;
export type ConversationInsert = typeof conversationTable.$inferInsert;
export type MessageRow = typeof messageTable.$inferSelect;
export type MessageInsert = typeof messageTable.$inferInsert;
