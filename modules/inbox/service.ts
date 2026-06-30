import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError, type Page } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { crmService } from "@/modules/crm/service";
import { inboxRepo, type PageParams } from "./repo";
import type { ConversationRow, MessageRow } from "./schema";

/**
 * inbox domain service — business logic + validation + cross-module side effects
 * (audit) + app-level cascade. Routes stay thin: parse → call a method → wrap
 * with the {ok,error} envelope.
 *
 * Owns two tables (conversation_v2, message_v2). Referential integrity is enforced
 * HERE (app layer), never via DB FKs (none exist): a conversation's `contact_id`
 * is validated against a live CRM contact (through `crmService`, the OWNING
 * module — modular-monolith rule: never reach into another module's tables), and
 * a message's `conversation_id` against a live conversation. Soft-delete/restore/
 * purge of a conversation CASCADES to its messages in the app layer.
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo scopes
 * all reads/writes to `ctx.tenantId` inside `withTenant`. Conversations are
 * additionally scoped by `workspace_id` + `contact_id` in-app (no FK).
 */

const CHANNELS = ["wa", "email", "instagram", "linkedin"] as const;
const CONVERSATION_STATUSES = ["open", "snoozed", "closed"] as const;
const DIRECTIONS = ["in", "out"] as const;
const MESSAGE_STATUSES = ["queued", "sent", "delivered", "read", "failed"] as const;

// ── input shapes ─────────────────────────────────────────────────────────────
export interface CreateConversationInput {
  contactId: string;
  workspaceId?: string | null;
  channel?: string; // wa|email|instagram|linkedin
  channelAccountId?: string | null;
  assignedUserId?: string | null;
  status?: string; // open|snoozed|closed
  avatarColor?: string | null;
}
export type UpdateConversationInput = Partial<Omit<CreateConversationInput, "contactId">>;

export interface CreateMessageInput {
  conversationId: string;
  direction: string; // in|out
  body: string;
  channel?: string | null;
  status?: string; // queued|sent|delivered|read|failed
  isAiGenerated?: boolean;
  attachmentLabel?: string | null;
  meta?: Record<string, unknown> | null;
  sentAt?: string | null;
}
export type UpdateMessageInput = Partial<Omit<CreateMessageInput, "conversationId" | "direction">>;

// ── validation helpers ───────────────────────────────────────────────────────
function assertEnum(
  value: string | undefined,
  allowed: readonly string[],
  field: string,
): string {
  const v = value ?? allowed[0];
  if (!allowed.includes(v)) {
    throw new ServiceError(`${field} harus salah satu dari: ${allowed.join(", ")}`, 400, "validation");
  }
  return v;
}

function parseDate(value: string | null | undefined, field: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ServiceError(`${field} tidak valid`, 400, "validation");
  }
  return d;
}

export const inboxService = {
  // ═══════════════════════ conversation ═════════════════════════════
  async listConversations(
    ctx: TenantContext,
    filter?: { contactId?: string; workspaceId?: string; channel?: string; status?: string },
  ): Promise<ConversationRow[]> {
    return inboxRepo.listConversations(ctx, filter);
  },

  async listTrashedConversations(ctx: TenantContext): Promise<ConversationRow[]> {
    return inboxRepo.listTrashedConversations(ctx);
  },

  async getConversation(ctx: TenantContext, id: string): Promise<ConversationRow> {
    const row = await inboxRepo.getConversation(ctx, id);
    if (!row) throw new ServiceError("Percakapan tidak ditemukan", 404, "not_found");
    return row;
  },

  async createConversation(
    ctx: TenantContext,
    input: CreateConversationInput,
  ): Promise<ConversationRow> {
    const contactId = input.contactId?.trim();
    if (!contactId) throw new ServiceError("contact_id wajib diisi", 400, "validation");
    const channel = assertEnum(input.channel, CHANNELS, "channel");
    const status = assertEnum(input.status, CONVERSATION_STATUSES, "status");
    // Integrity: a conversation must belong to a live contact in this tenant.
    // Goes through the OWNING module's service (crm), not its tables.
    await crmService.getContact(ctx, contactId);

    const row = await inboxRepo.insertConversation(ctx, {
      id: "cnv_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      contactId,
      workspaceId: input.workspaceId ?? null,
      channel,
      channelAccountId: input.channelAccountId ?? null,
      assignedUserId: input.assignedUserId ?? ctx.userId,
      status,
      avatarColor: input.avatarColor ?? null,
    });
    await this.audit(ctx, "inbox.conversation.create", "conversation", row.id, {
      contactId,
      channel,
    });
    return row;
  },

  /** Get the live conversation for (contact, channel), creating one if absent. */
  async ensureConversation(
    ctx: TenantContext,
    contactId: string,
    channel: string,
    extra?: { workspaceId?: string | null; assignedUserId?: string | null },
  ): Promise<ConversationRow> {
    const ch = assertEnum(channel, CHANNELS, "channel");
    const existing = await inboxRepo.findConversationByContactChannel(ctx, contactId, ch);
    if (existing) return existing;
    return this.createConversation(ctx, {
      contactId,
      channel: ch,
      workspaceId: extra?.workspaceId ?? null,
      assignedUserId: extra?.assignedUserId ?? null,
    });
  },

  async updateConversation(
    ctx: TenantContext,
    id: string,
    input: UpdateConversationInput,
  ): Promise<ConversationRow> {
    await this.getConversation(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.channel !== undefined) patch.channel = assertEnum(input.channel, CHANNELS, "channel");
    if (input.status !== undefined)
      patch.status = assertEnum(input.status, CONVERSATION_STATUSES, "status");
    for (const f of [
      "workspaceId",
      "channelAccountId",
      "assignedUserId",
      "avatarColor",
    ] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await inboxRepo.updateConversation(ctx, id, patch);
    if (!row) throw new ServiceError("Percakapan tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "inbox.conversation.update", "conversation", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  /** Reset unread_count to 0 (mark a thread as read). */
  async markRead(ctx: TenantContext, id: string): Promise<ConversationRow> {
    await this.getConversation(ctx, id);
    const row = await inboxRepo.updateConversation(ctx, id, { unreadCount: 0 });
    if (!row) throw new ServiceError("Percakapan tidak ditemukan", 404, "not_found");
    return row;
  },

  async softDeleteConversation(ctx: TenantContext, id: string): Promise<void> {
    const ok = await inboxRepo.softDeleteConversation(ctx, id);
    if (!ok) throw new ServiceError("Percakapan tidak ditemukan", 404, "not_found");
    // App-level cascade: trash the conversation's messages alongside it.
    await inboxRepo.setMessagesDeletedByConversation(ctx, [id], true);
    await this.audit(ctx, "inbox.conversation.delete", "conversation", id);
  },

  async restoreConversation(ctx: TenantContext, id: string): Promise<ConversationRow> {
    const ok = await inboxRepo.restoreConversation(ctx, id);
    if (!ok) throw new ServiceError("Percakapan tidak ada di trash", 404, "not_found");
    await inboxRepo.setMessagesDeletedByConversation(ctx, [id], false);
    await this.audit(ctx, "inbox.conversation.restore", "conversation", id);
    return this.getConversation(ctx, id);
  },

  async hardDeleteConversation(ctx: TenantContext, id: string): Promise<void> {
    const ok = await inboxRepo.hardDeleteConversation(ctx, id);
    if (!ok) throw new ServiceError("Percakapan tidak ditemukan", 404, "not_found");
    await inboxRepo.hardDeleteMessagesByConversation(ctx, id);
    await this.audit(ctx, "inbox.conversation.purge", "conversation", id);
  },

  // ═══════════════════════ message ══════════════════════════════════
  async listMessages(
    ctx: TenantContext,
    filter?: { conversationId?: string; direction?: string },
  ): Promise<MessageRow[]> {
    return inboxRepo.listMessages(ctx, filter);
  },

  /**
   * Keyset-paginated thread window — the route's default read. Requires a
   * `conversationId` (a thread is always read in the context of one conversation)
   * and returns the MOST-RECENT N live messages (ascending for display) plus a
   * `nextCursor` to lazily load older history.
   */
  async pageMessages(
    ctx: TenantContext,
    conversationId: string,
    page?: PageParams,
    direction?: string,
  ): Promise<Page<MessageRow>> {
    const cid = conversationId?.trim();
    if (!cid) throw new ServiceError("conversation_id wajib diisi", 400, "validation");
    return inboxRepo.pageMessages(ctx, cid, page, direction);
  },

  async listTrashedMessages(ctx: TenantContext): Promise<MessageRow[]> {
    return inboxRepo.listTrashedMessages(ctx);
  },

  async getMessage(ctx: TenantContext, id: string): Promise<MessageRow> {
    const row = await inboxRepo.getMessage(ctx, id);
    if (!row) throw new ServiceError("Pesan tidak ditemukan", 404, "not_found");
    return row;
  },

  async createMessage(ctx: TenantContext, input: CreateMessageInput): Promise<MessageRow> {
    const conversationId = input.conversationId?.trim();
    if (!conversationId) throw new ServiceError("conversation_id wajib diisi", 400, "validation");
    const body = input.body?.trim();
    if (!body) throw new ServiceError("Isi pesan wajib diisi", 400, "validation");
    const direction = assertEnum(input.direction, DIRECTIONS, "direction");
    const status = assertEnum(input.status, MESSAGE_STATUSES, "status");
    // Integrity: a message must belong to a live conversation in this tenant.
    const conversation = await this.getConversation(ctx, conversationId);
    const sentAt = parseDate(input.sentAt, "sent_at");

    const row = await inboxRepo.insertMessage(ctx, {
      id: "msg_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      conversationId,
      direction,
      body,
      channel: input.channel ?? conversation.channel,
      status,
      isAiGenerated: input.isAiGenerated ?? false,
      attachmentLabel: input.attachmentLabel ?? null,
      meta: input.meta ?? null,
      sentAt: sentAt ?? (direction === "out" ? new Date() : null),
    });

    // Rollup: bump the conversation's preview + sort key, and the unread count for
    // INBOUND messages (an inbound message is unread until markRead).
    await inboxRepo.updateConversation(ctx, conversationId, {
      lastMessage: body.slice(0, 280),
      lastMessageAt: row.sentAt ?? row.createdAt,
      unreadCount: direction === "in" ? conversation.unreadCount + 1 : conversation.unreadCount,
    });

    await this.audit(ctx, "inbox.message.create", "message", row.id, {
      conversationId,
      direction,
    });
    return row;
  },

  async updateMessage(
    ctx: TenantContext,
    id: string,
    input: UpdateMessageInput,
  ): Promise<MessageRow> {
    await this.getMessage(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.body !== undefined) {
      const body = input.body?.trim();
      if (!body) throw new ServiceError("Isi pesan wajib diisi", 400, "validation");
      patch.body = body;
    }
    if (input.status !== undefined)
      patch.status = assertEnum(input.status, MESSAGE_STATUSES, "status");
    if (input.sentAt !== undefined) patch.sentAt = parseDate(input.sentAt, "sent_at");
    for (const f of ["channel", "isAiGenerated", "attachmentLabel", "meta"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await inboxRepo.updateMessage(ctx, id, patch);
    if (!row) throw new ServiceError("Pesan tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "inbox.message.update", "message", id, { fields: Object.keys(patch) });
    return row;
  },

  async softDeleteMessage(ctx: TenantContext, id: string): Promise<void> {
    const ok = await inboxRepo.softDeleteMessage(ctx, id);
    if (!ok) throw new ServiceError("Pesan tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "inbox.message.delete", "message", id);
  },

  async restoreMessage(ctx: TenantContext, id: string): Promise<MessageRow> {
    const ok = await inboxRepo.restoreMessage(ctx, id);
    if (!ok) throw new ServiceError("Pesan tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "inbox.message.restore", "message", id);
    return this.getMessage(ctx, id);
  },

  async hardDeleteMessage(ctx: TenantContext, id: string): Promise<void> {
    const ok = await inboxRepo.hardDeleteMessage(ctx, id);
    if (!ok) throw new ServiceError("Pesan tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "inbox.message.purge", "message", id);
  },

  // ═══════════════════════ internal helpers ═════════════════════════
  /** Write a tenant-scoped audit row for an inbox mutation. */
  async audit(
    ctx: TenantContext,
    action: string,
    targetType: string,
    targetId: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action,
      targetType,
      targetId,
      meta: meta ?? null,
    });
  },
};
