import { hasDb } from "@/lib/db/client";
import type { TenantContext } from "@/lib/db/tenant-context";

import { notificationRepo } from "./repo";
import type { NotificationRow } from "./schema";

/**
 * notification domain service — the ONE seam every feature emits through, and the
 * read/mutate surface the bell + routes call.
 *
 * `emit` is BEST-EFFORT and NEVER throws: it is wired at real event points (a new
 * lead, a won deal, an escalation, low quota, …) right beside `insertAudit`, so a
 * notification failure (bad DB, RLS glitch, mock mode) must never break the action
 * that raised it. Everything is wrapped in try/catch and swallowed to console.
 *
 * GRAIN = TENANT: pass the emitting context; `userId` narrows a row to one user,
 * omit it (null) for a tenant-wide notice all members see. Cross-tenant emits
 * (marketplace seller, superadmin → tenant) synthesize the recipient's context.
 */
export interface EmitInput {
  type: string; // lead|deal|escalation|quota|marketplace|order|member|tenant
  title: string;
  body?: string | null;
  link?: string | null;
  /** null / omitted = tenant-wide (all members); else private to this user. */
  userId?: string | null;
  meta?: Record<string, unknown> | null;
  /**
   * When set, skip the emit if a LIVE unread row of the same `type`+`title`
   * (same recipient) already exists within this window — de-dupes hot repeat
   * events (e.g. an over-quota check that fires on every AI call).
   */
  dedupeWithinMs?: number;
}

export const notificationService = {
  /** Fire a notification. Best-effort; returns void, never throws. */
  async emit(ctx: TenantContext, input: EmitInput): Promise<void> {
    try {
      if (!hasDb()) return; // pure-mock/demo mode — no store to write to.
      const userId = input.userId === undefined ? null : input.userId;
      if (input.dedupeWithinMs) {
        const dup = await notificationRepo.existsRecent(ctx, {
          type: input.type,
          title: input.title,
          userId,
          sinceMs: input.dedupeWithinMs,
        });
        if (dup) return;
      }
      await notificationRepo.insert(ctx, {
        id: "ntf_" + crypto.randomUUID(),
        tenantId: ctx.tenantId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        read: false,
        meta: input.meta ?? null,
      });
    } catch (err) {
      // Never let a notification failure bubble into the triggering action.
      console.error("[notification.emit]", input.type, err);
    }
  },

  async list(ctx: TenantContext, limit?: number): Promise<NotificationRow[]> {
    return notificationRepo.listForCtx(ctx, limit);
  },

  async countUnread(ctx: TenantContext): Promise<number> {
    return notificationRepo.countUnread(ctx);
  },

  async markRead(ctx: TenantContext, id: string): Promise<boolean> {
    return notificationRepo.markRead(ctx, id);
  },

  async markAllRead(ctx: TenantContext): Promise<number> {
    return notificationRepo.markAllRead(ctx);
  },

  async softDelete(ctx: TenantContext, id: string): Promise<boolean> {
    return notificationRepo.softDelete(ctx, id);
  },
};
