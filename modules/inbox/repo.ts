import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  conversationTable,
  messageTable,
  type ConversationRow,
  type ConversationInsert,
  type MessageRow,
  type MessageInsert,
} from "./schema";

/**
 * inbox domain repo — the ONLY place that touches `conversation_v2` and
 * `message_v2`. Both are TENANT-scoped, so every read/write is wrapped in
 * `withTenant` and filtered by `tenant_id`.
 *
 * Each entity exposes the soft-delete contract: list/get filter
 * `deleted_at IS NULL`; `*Trashed` flips to ONLY soft-deleted rows; `softDelete`
 * sets `deleted_at`; `restore` clears it (only matching already-trashed rows);
 * `hardDelete` is a real SQL DELETE (purge). The service needs cross-entity reads
 * for cascade (a conversation's messages) and rollups (latest message preview /
 * unread bump) — exposed here as `listMessagesByConversation` + bulk
 * `setMessagesDeletedByConversation` + `hardDeleteMessagesByConversation`.
 */
export const inboxRepo = {
  // ═══════════════════════ conversation_v2 ══════════════════════════
  // Tenant-scoped; optionally filter by `contactId` / `workspaceId` / `channel`
  // / `status`. Ordered by `last_message_at` (newest thread first), nulls last.
  async listConversations(
    ctx: TenantContext,
    filter?: { contactId?: string; workspaceId?: string; channel?: string; status?: string },
  ): Promise<ConversationRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(conversationTable)
        .where(
          and(
            eq(conversationTable.tenantId, ctx.tenantId),
            isNull(conversationTable.deletedAt),
            filter?.contactId ? eq(conversationTable.contactId, filter.contactId) : undefined,
            filter?.workspaceId ? eq(conversationTable.workspaceId, filter.workspaceId) : undefined,
            filter?.channel ? eq(conversationTable.channel, filter.channel) : undefined,
            filter?.status ? eq(conversationTable.status, filter.status) : undefined,
          ),
        )
        .orderBy(desc(conversationTable.lastMessageAt), desc(conversationTable.createdAt)),
    );
  },

  async listTrashedConversations(ctx: TenantContext): Promise<ConversationRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(conversationTable)
        .where(
          and(eq(conversationTable.tenantId, ctx.tenantId), isNotNull(conversationTable.deletedAt)),
        )
        .orderBy(desc(conversationTable.deletedAt)),
    );
  },

  async getConversation(ctx: TenantContext, id: string): Promise<ConversationRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(conversationTable)
        .where(
          and(
            eq(conversationTable.tenantId, ctx.tenantId),
            eq(conversationTable.id, id),
            isNull(conversationTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Find a live conversation by its (contact, channel) pair — dedup on send. */
  async findConversationByContactChannel(
    ctx: TenantContext,
    contactId: string,
    channel: string,
  ): Promise<ConversationRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(conversationTable)
        .where(
          and(
            eq(conversationTable.tenantId, ctx.tenantId),
            eq(conversationTable.contactId, contactId),
            eq(conversationTable.channel, channel),
            isNull(conversationTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertConversation(
    ctx: TenantContext,
    values: ConversationInsert,
  ): Promise<ConversationRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(conversationTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async updateConversation(
    ctx: TenantContext,
    id: string,
    patch: Partial<ConversationInsert>,
  ): Promise<ConversationRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(conversationTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(conversationTable.tenantId, ctx.tenantId),
            eq(conversationTable.id, id),
            isNull(conversationTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteConversation(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(conversationTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(conversationTable.tenantId, ctx.tenantId),
            eq(conversationTable.id, id),
            isNull(conversationTable.deletedAt),
          ),
        )
        .returning({ id: conversationTable.id }),
    );
    return rows.length > 0;
  },

  async restoreConversation(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(conversationTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(conversationTable.tenantId, ctx.tenantId),
            eq(conversationTable.id, id),
            isNotNull(conversationTable.deletedAt),
          ),
        )
        .returning({ id: conversationTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteConversation(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(conversationTable)
        .where(and(eq(conversationTable.tenantId, ctx.tenantId), eq(conversationTable.id, id)))
        .returning({ id: conversationTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ message_v2 ═══════════════════════════════
  // Tenant-scoped; filter by `conversationId` / `direction`. Ordered oldest→newest
  // (a chat transcript reads top-to-bottom).
  async listMessages(
    ctx: TenantContext,
    filter?: { conversationId?: string; direction?: string },
  ): Promise<MessageRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(messageTable)
        .where(
          and(
            eq(messageTable.tenantId, ctx.tenantId),
            isNull(messageTable.deletedAt),
            filter?.conversationId
              ? eq(messageTable.conversationId, filter.conversationId)
              : undefined,
            filter?.direction ? eq(messageTable.direction, filter.direction) : undefined,
          ),
        )
        .orderBy(asc(messageTable.createdAt)),
    );
  },

  async listTrashedMessages(ctx: TenantContext): Promise<MessageRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(messageTable)
        .where(and(eq(messageTable.tenantId, ctx.tenantId), isNotNull(messageTable.deletedAt)))
        .orderBy(desc(messageTable.deletedAt)),
    );
  },

  async getMessage(ctx: TenantContext, id: string): Promise<MessageRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(messageTable)
        .where(
          and(
            eq(messageTable.tenantId, ctx.tenantId),
            eq(messageTable.id, id),
            isNull(messageTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Live messages of a conversation (cascade when the conversation is trashed). */
  async listMessagesByConversation(
    ctx: TenantContext,
    conversationId: string,
  ): Promise<MessageRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(messageTable)
        .where(
          and(
            eq(messageTable.tenantId, ctx.tenantId),
            eq(messageTable.conversationId, conversationId),
            isNull(messageTable.deletedAt),
          ),
        )
        .orderBy(asc(messageTable.createdAt)),
    );
  },

  async insertMessage(ctx: TenantContext, values: MessageInsert): Promise<MessageRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(messageTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async updateMessage(
    ctx: TenantContext,
    id: string,
    patch: Partial<MessageInsert>,
  ): Promise<MessageRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(messageTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(messageTable.tenantId, ctx.tenantId),
            eq(messageTable.id, id),
            isNull(messageTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteMessage(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(messageTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(messageTable.tenantId, ctx.tenantId),
            eq(messageTable.id, id),
            isNull(messageTable.deletedAt),
          ),
        )
        .returning({ id: messageTable.id }),
    );
    return rows.length > 0;
  },

  async restoreMessage(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(messageTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(messageTable.tenantId, ctx.tenantId),
            eq(messageTable.id, id),
            isNotNull(messageTable.deletedAt),
          ),
        )
        .returning({ id: messageTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteMessage(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(messageTable)
        .where(and(eq(messageTable.tenantId, ctx.tenantId), eq(messageTable.id, id)))
        .returning({ id: messageTable.id }),
    );
    return rows.length > 0;
  },

  /** Bulk soft/restore of a conversation's messages (cascade with the thread). */
  async setMessagesDeletedByConversation(
    ctx: TenantContext,
    conversationIds: string[],
    deleted: boolean,
  ): Promise<void> {
    if (conversationIds.length === 0) return;
    await withTenant(ctx, (tx) =>
      tx
        .update(messageTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(messageTable.tenantId, ctx.tenantId),
            inArray(messageTable.conversationId, conversationIds),
          ),
        ),
    );
  },

  async hardDeleteMessagesByConversation(
    ctx: TenantContext,
    conversationId: string,
  ): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .delete(messageTable)
        .where(
          and(
            eq(messageTable.tenantId, ctx.tenantId),
            eq(messageTable.conversationId, conversationId),
          ),
        ),
    );
  },
};
