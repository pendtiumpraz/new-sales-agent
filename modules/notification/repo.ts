import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { notificationTable, type NotificationRow, type NotificationInsert } from "./schema";

/**
 * notification repo — the ONLY place that touches the `notification` table.
 * TENANT-scoped, so every read/write is wrapped in `withTenant` and pinned to
 * `ctx.tenantId`. The feed unions tenant-wide rows (`user_id IS NULL`) with the
 * caller's private rows (`user_id = ctx.userId`).
 */
const FEED_LIMIT = 50;

/** Rows visible to `ctx`: this tenant, either tenant-wide or the caller's own. */
function visibleTo(ctx: TenantContext) {
  return and(
    eq(notificationTable.tenantId, ctx.tenantId),
    isNull(notificationTable.deletedAt),
    or(isNull(notificationTable.userId), eq(notificationTable.userId, ctx.userId)),
  );
}

export const notificationRepo = {
  async insert(ctx: TenantContext, values: NotificationInsert): Promise<NotificationRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(notificationTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  /** Newest-first feed for the caller (tenant-wide ∪ own), live rows only. */
  async listForCtx(ctx: TenantContext, limit = FEED_LIMIT): Promise<NotificationRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(notificationTable)
        .where(visibleTo(ctx))
        .orderBy(desc(notificationTable.createdAt))
        .limit(limit),
    );
  },

  /** Count of UNREAD rows the caller can see (drives the bell badge). */
  async countUnread(ctx: TenantContext): Promise<number> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(notificationTable)
        .where(and(visibleTo(ctx), eq(notificationTable.read, false))),
    );
    return row?.n ?? 0;
  },

  /**
   * Best-effort de-dupe probe: does a LIVE, UNREAD row of this `type` with the
   * same `title` (optionally the same recipient) exist within the last
   * `sinceMs`? Used by the service to avoid spamming repeat events (e.g. quota).
   */
  async existsRecent(
    ctx: TenantContext,
    args: { type: string; title: string; userId?: string | null; sinceMs: number },
  ): Promise<boolean> {
    const since = new Date(Date.now() - args.sinceMs);
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({ id: notificationTable.id })
        .from(notificationTable)
        .where(
          and(
            eq(notificationTable.tenantId, ctx.tenantId),
            isNull(notificationTable.deletedAt),
            eq(notificationTable.read, false),
            eq(notificationTable.type, args.type),
            eq(notificationTable.title, args.title),
            args.userId === undefined
              ? undefined
              : args.userId === null
                ? isNull(notificationTable.userId)
                : eq(notificationTable.userId, args.userId),
            gt(notificationTable.createdAt, since),
          ),
        )
        .limit(1),
    );
    return rows.length > 0;
  },

  /** Mark one row read (only if the caller can see it). Returns true if flipped. */
  async markRead(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(notificationTable)
        .set({ read: true })
        .where(and(visibleTo(ctx), eq(notificationTable.id, id)))
        .returning({ id: notificationTable.id }),
    );
    return rows.length > 0;
  },

  /** Mark every visible unread row read. Returns how many were flipped. */
  async markAllRead(ctx: TenantContext): Promise<number> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(notificationTable)
        .set({ read: true })
        .where(and(visibleTo(ctx), eq(notificationTable.read, false)))
        .returning({ id: notificationTable.id }),
    );
    return rows.length;
  },

  /** Soft-delete one row (dismiss). Returns true if a row was hidden. */
  async softDelete(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(notificationTable)
        .set({ deletedAt: new Date() })
        .where(and(visibleTo(ctx), eq(notificationTable.id, id)))
        .returning({ id: notificationTable.id }),
    );
    return rows.length > 0;
  },
};
