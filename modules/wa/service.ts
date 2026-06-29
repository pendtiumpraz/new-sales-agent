import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { inboxService } from "@/modules/inbox/service";
import { waRepo } from "./repo";
import type { WaSessionRow, WaOutboxRow } from "./schema";

/**
 * wa domain service — WhatsApp TRANSPORT state, gateway-agnostic. The backend only
 * QUEUES + READS; the actual send is done by an EXTERNAL gateway (browser
 * extension or a WAHA instance) that polls `listSendable` and reports back. This
 * service NEVER talks to WhatsApp directly.
 *
 * Owns two tables (wa_session_v2, wa_outbox_v2) — both operational/queue tables
 * with NO soft delete (lifecycle via `status`). Referential integrity is enforced
 * HERE (app layer): an outbox row is REPLY-ONLY — it must reference a live
 * conversation that already has an INBOUND message (we never cold-message), and
 * the resolved session must belong to this tenant. Queuing an outbound message
 * also persists it into the inbox (`message_v2`, status=queued) through the OWNING
 * inbox module's service, so the inbox + outbox stay coherent (modular-monolith
 * rule: cross-module writes go through the owning service, never its tables).
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo scopes
 * all reads/writes to `ctx.tenantId` inside `withTenant`.
 */

const SESSION_STATUSES = ["idle", "qr", "connecting", "connected", "disconnected"] as const;
const GATEWAYS = ["extension", "waha"] as const;
const OUTBOX_STATUSES = ["queued", "sending", "sent", "failed", "canceled"] as const;

// Pacing bounds (ms) — keep sends human-feeling, cap unbounded scheduling.
const MAX_DELAY_MS = 5 * 60_000; // 5 min

// ── input shapes ─────────────────────────────────────────────────────────────
export interface CreateSessionInput {
  userId?: string | null;
  label?: string | null;
  gateway?: string; // extension|waha
  status?: string; // idle|qr|connecting|connected|disconnected
  phoneNumber?: string | null;
  qr?: string | null;
  meta?: Record<string, unknown> | null;
}
export interface UpdateSessionInput {
  label?: string | null;
  status?: string;
  phoneNumber?: string | null;
  qr?: string | null;
  gateway?: string;
  meta?: Record<string, unknown> | null;
  lastSeenAt?: string | null; // heartbeat
}

export interface QueueOutboxInput {
  conversationId: string;
  body: string;
  sessionId?: string | null;
  delayMs?: number;
  toNumber?: string | null;
}

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

function clampDelay(value: number | undefined): number {
  const v = value ?? 0;
  if (!Number.isFinite(v) || v < 0) {
    throw new ServiceError("delay_ms tidak valid", 400, "validation");
  }
  return Math.min(Math.floor(v), MAX_DELAY_MS);
}

export const waService = {
  // ═══════════════════════ wa_session_v2 ════════════════════════════
  async listSessions(ctx: TenantContext, userId?: string): Promise<WaSessionRow[]> {
    return waRepo.listSessions(ctx, userId);
  },

  async getSession(ctx: TenantContext, id: string): Promise<WaSessionRow> {
    const row = await waRepo.getSession(ctx, id);
    if (!row) throw new ServiceError("Sesi WA tidak ditemukan", 404, "not_found");
    return row;
  },

  /** Open a new WA connection (status defaults to `qr` so the gateway can attach a
   *  QR/pairing payload as the device links). */
  async createSession(ctx: TenantContext, input: CreateSessionInput): Promise<WaSessionRow> {
    const status = assertEnum(input.status ?? "qr", SESSION_STATUSES, "status");
    const gateway = assertEnum(input.gateway, GATEWAYS, "gateway");
    const row = await waRepo.insertSession(ctx, {
      id: "was_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      userId: input.userId ?? ctx.userId,
      label: input.label ?? null,
      status,
      phoneNumber: input.phoneNumber ?? null,
      qr: input.qr ?? null,
      gateway,
      meta: input.meta ?? null,
    });
    await this.audit(ctx, "wa.session.create", "wa_session", row.id, { gateway, status });
    return row;
  },

  /** Gateway/UI update of session state (QR scanned → connected, heartbeat, …).
   *  Stamps `connected_at`/`last_seen_at` on the connected transition. */
  async updateSession(
    ctx: TenantContext,
    id: string,
    input: UpdateSessionInput,
  ): Promise<WaSessionRow> {
    const current = await this.getSession(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) {
      const status = assertEnum(input.status, SESSION_STATUSES, "status");
      patch.status = status;
      if (status === "connected") {
        patch.lastSeenAt = new Date();
        if (current.status !== "connected") patch.connectedAt = new Date();
      }
    }
    if (input.gateway !== undefined) patch.gateway = assertEnum(input.gateway, GATEWAYS, "gateway");
    if (input.lastSeenAt !== undefined) {
      const d = input.lastSeenAt ? new Date(input.lastSeenAt) : new Date();
      if (Number.isNaN(d.getTime())) throw new ServiceError("last_seen_at tidak valid", 400, "validation");
      patch.lastSeenAt = d;
    }
    for (const f of ["label", "phoneNumber", "qr", "meta"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await waRepo.updateSession(ctx, id, patch);
    if (!row) throw new ServiceError("Sesi WA tidak ditemukan", 404, "not_found");
    return row;
  },

  /** Disconnect a session (status=disconnected; the gateway should drop the link). */
  async disconnectSession(ctx: TenantContext, id: string): Promise<WaSessionRow> {
    await this.getSession(ctx, id);
    const row = await waRepo.updateSession(ctx, id, { status: "disconnected", qr: null });
    if (!row) throw new ServiceError("Sesi WA tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "wa.session.disconnect", "wa_session", id);
    return row;
  },

  async deleteSession(ctx: TenantContext, id: string): Promise<void> {
    const ok = await waRepo.deleteSession(ctx, id);
    if (!ok) throw new ServiceError("Sesi WA tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "wa.session.delete", "wa_session", id);
  },

  // ═══════════════════════ wa_outbox_v2 ═════════════════════════════
  async listOutbox(
    ctx: TenantContext,
    filter?: { status?: string; conversationId?: string },
  ): Promise<WaOutboxRow[]> {
    return waRepo.listOutbox(ctx, filter);
  },

  async getOutbox(ctx: TenantContext, id: string): Promise<WaOutboxRow> {
    const row = await waRepo.getOutbox(ctx, id);
    if (!row) throw new ServiceError("Outbox WA tidak ditemukan", 404, "not_found");
    return row;
  },

  /** Gateway poll: queued rows whose pacing delay has elapsed, oldest first. */
  async listSendable(ctx: TenantContext, limit = 20): Promise<WaOutboxRow[]> {
    return waRepo.listSendable(ctx, limit);
  },

  /**
   * Queue an OUTBOUND WA message (reply-only). Validates:
   *  - the conversation is live in this tenant AND has ≥1 inbound message
   *    (REPLY-ONLY guard — never cold-message),
   *  - the session (if given) belongs to this tenant and is `connected`.
   * Computes `scheduled_at = now + delay_ms` (pacing), persists the outbound
   * message into the inbox (`message_v2`, status=queued) for coherence, then
   * enqueues the outbox row linked to that message.
   */
  async queueOutbox(ctx: TenantContext, input: QueueOutboxInput): Promise<WaOutboxRow> {
    const conversationId = input.conversationId?.trim();
    if (!conversationId) throw new ServiceError("conversation_id wajib diisi", 400, "validation");
    const body = input.body?.trim();
    if (!body) throw new ServiceError("Isi pesan wajib diisi", 400, "validation");

    // Integrity + reply-only: the conversation must be live and already have an
    // inbound message in it (we only reply, never initiate).
    const conversation = await inboxService.getConversation(ctx, conversationId);
    const messages = await inboxService.listMessages(ctx, { conversationId });
    const hasInbound = messages.some((m) => m.direction === "in");
    if (!hasInbound) {
      throw new ServiceError(
        "Reply-only: percakapan ini belum punya pesan masuk",
        409,
        "reply_only",
      );
    }

    // Session (optional) must belong to this tenant and be connected.
    const sessionId = input.sessionId ?? null;
    if (sessionId) {
      const session = await this.getSession(ctx, sessionId);
      if (session.status !== "connected") {
        throw new ServiceError("Sesi WA belum terhubung", 409, "session_not_connected");
      }
    }

    const delayMs = clampDelay(input.delayMs);
    const scheduledAt = new Date(Date.now() + delayMs);

    // Persist the outbound message into the inbox (status=queued) so the thread
    // reflects the pending reply. Goes through the owning inbox service.
    const message = await inboxService.createMessage(ctx, {
      conversationId,
      direction: "out",
      body,
      channel: conversation.channel,
      status: "queued",
    });

    const row = await waRepo.insertOutbox(ctx, {
      id: "wao_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      sessionId,
      conversationId,
      contactId: conversation.contactId,
      messageId: message.id,
      toNumber: input.toNumber ?? null,
      body,
      delayMs,
      status: "queued",
      scheduledAt,
    });
    await this.audit(ctx, "wa.outbox.queue", "wa_outbox", row.id, {
      conversationId,
      delayMs,
    });
    return row;
  },

  /** Gateway reports a successful send. Flips outbox → sent and the linked inbox
   *  message → sent. Guarded transition (only queued/sending). */
  async markSent(ctx: TenantContext, id: string): Promise<WaOutboxRow> {
    const row = await waRepo.transitionOutbox(ctx, id, ["queued", "sending"], {
      status: "sent",
      sentAt: new Date(),
      error: null,
    });
    if (!row) throw new ServiceError("Outbox WA tidak dapat ditandai terkirim", 409, "bad_state");
    if (row.messageId) {
      await inboxService.updateMessage(ctx, row.messageId, { status: "sent", sentAt: new Date().toISOString() }).catch(() => {});
    }
    await this.audit(ctx, "wa.outbox.sent", "wa_outbox", id);
    return row;
  },

  /** Gateway reports a failure. Flips outbox → failed and the linked inbox message
   *  → failed, recording the reason + bumping attempts. */
  async markFailed(ctx: TenantContext, id: string, error?: string): Promise<WaOutboxRow> {
    const current = await this.getOutbox(ctx, id);
    const row = await waRepo.transitionOutbox(ctx, id, ["queued", "sending"], {
      status: "failed",
      error: error ?? "send_failed",
      attempts: current.attempts + 1,
    });
    if (!row) throw new ServiceError("Outbox WA tidak dapat ditandai gagal", 409, "bad_state");
    if (row.messageId) {
      await inboxService.updateMessage(ctx, row.messageId, { status: "failed" }).catch(() => {});
    }
    await this.audit(ctx, "wa.outbox.failed", "wa_outbox", id, { error: error ?? "send_failed" });
    return row;
  },

  /** Cancel a still-queued outbox row (and its pending inbox message). */
  async cancelOutbox(ctx: TenantContext, id: string): Promise<WaOutboxRow> {
    const row = await waRepo.transitionOutbox(ctx, id, ["queued"], { status: "canceled" });
    if (!row) throw new ServiceError("Outbox WA tidak dapat dibatalkan", 409, "bad_state");
    if (row.messageId) {
      await inboxService.softDeleteMessage(ctx, row.messageId).catch(() => {});
    }
    await this.audit(ctx, "wa.outbox.cancel", "wa_outbox", id);
    return row;
  },

  /** Generic status patch (e.g. gateway claiming a row: queued → sending). */
  async updateOutboxStatus(ctx: TenantContext, id: string, status: string): Promise<WaOutboxRow> {
    const next = assertEnum(status, OUTBOX_STATUSES, "status");
    await this.getOutbox(ctx, id);
    const row = await waRepo.updateOutbox(ctx, id, { status: next });
    if (!row) throw new ServiceError("Outbox WA tidak ditemukan", 404, "not_found");
    return row;
  },

  // ═══════════════════════ internal helpers ═════════════════════════
  /** Write a tenant-scoped audit row for a wa mutation. */
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
