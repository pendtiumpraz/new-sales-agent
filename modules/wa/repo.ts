import { and, asc, desc, eq, inArray, lte, or, isNull } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  waSessionTable,
  waOutboxTable,
  type WaSessionRow,
  type WaSessionInsert,
  type WaOutboxRow,
  type WaOutboxInsert,
} from "./schema";

/**
 * wa domain repo — the ONLY place that touches `wa_session_v2` and
 * `wa_outbox_v2`. Both are TENANT-scoped operational/queue tables (NO soft
 * delete): a session ends as `disconnected`, an outbox row as `canceled`/`sent`.
 * Lifecycle is tracked via the `status` column, so there is no
 * softDelete/restore/trashed contract here (unlike inbox) — the task scopes wa to
 * QUEUE + READ.
 *
 * Every read/write is wrapped in `withTenant` and filtered by `tenant_id`. The
 * external gateway (extension / WAHA) polls `listSendable` and reports back via
 * `markOutbox*` / `updateSession`.
 */
export const waRepo = {
  // ═══════════════════════ wa_session_v2 ════════════════════════════
  async listSessions(ctx: TenantContext, userId?: string): Promise<WaSessionRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(waSessionTable)
        .where(
          and(
            eq(waSessionTable.tenantId, ctx.tenantId),
            userId ? eq(waSessionTable.userId, userId) : undefined,
          ),
        )
        .orderBy(desc(waSessionTable.createdAt)),
    );
  },

  async getSession(ctx: TenantContext, id: string): Promise<WaSessionRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(waSessionTable)
        .where(and(eq(waSessionTable.tenantId, ctx.tenantId), eq(waSessionTable.id, id)))
        .limit(1),
    );
    return row;
  },

  async insertSession(ctx: TenantContext, values: WaSessionInsert): Promise<WaSessionRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(waSessionTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async updateSession(
    ctx: TenantContext,
    id: string,
    patch: Partial<WaSessionInsert>,
  ): Promise<WaSessionRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(waSessionTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(and(eq(waSessionTable.tenantId, ctx.tenantId), eq(waSessionTable.id, id)))
        .returning(),
    );
    return row;
  },

  async deleteSession(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(waSessionTable)
        .where(and(eq(waSessionTable.tenantId, ctx.tenantId), eq(waSessionTable.id, id)))
        .returning({ id: waSessionTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ wa_outbox_v2 ═════════════════════════════
  async listOutbox(
    ctx: TenantContext,
    filter?: { status?: string; conversationId?: string },
  ): Promise<WaOutboxRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(waOutboxTable)
        .where(
          and(
            eq(waOutboxTable.tenantId, ctx.tenantId),
            filter?.status ? eq(waOutboxTable.status, filter.status) : undefined,
            filter?.conversationId
              ? eq(waOutboxTable.conversationId, filter.conversationId)
              : undefined,
          ),
        )
        .orderBy(desc(waOutboxTable.createdAt)),
    );
  },

  async getOutbox(ctx: TenantContext, id: string): Promise<WaOutboxRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(waOutboxTable)
        .where(and(eq(waOutboxTable.tenantId, ctx.tenantId), eq(waOutboxTable.id, id)))
        .limit(1),
    );
    return row;
  },

  /** Gateway poll: queued rows whose pacing delay has elapsed (scheduled_at ≤ now,
   *  or null = send-now), oldest first. */
  async listSendable(ctx: TenantContext, limit = 20): Promise<WaOutboxRow[]> {
    const now = new Date();
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(waOutboxTable)
        .where(
          and(
            eq(waOutboxTable.tenantId, ctx.tenantId),
            eq(waOutboxTable.status, "queued"),
            or(isNull(waOutboxTable.scheduledAt), lte(waOutboxTable.scheduledAt, now)),
          ),
        )
        .orderBy(asc(waOutboxTable.scheduledAt), asc(waOutboxTable.createdAt))
        .limit(limit),
    );
  },

  async insertOutbox(ctx: TenantContext, values: WaOutboxInsert): Promise<WaOutboxRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(waOutboxTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async updateOutbox(
    ctx: TenantContext,
    id: string,
    patch: Partial<WaOutboxInsert>,
  ): Promise<WaOutboxRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(waOutboxTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(and(eq(waOutboxTable.tenantId, ctx.tenantId), eq(waOutboxTable.id, id)))
        .returning(),
    );
    return row;
  },

  /** Transition an outbox row's status only when it is in one of `from` states
   *  (optimistic guard so two pollers don't both send the same row). */
  async transitionOutbox(
    ctx: TenantContext,
    id: string,
    from: string[],
    patch: Partial<WaOutboxInsert>,
  ): Promise<WaOutboxRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(waOutboxTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(waOutboxTable.tenantId, ctx.tenantId),
            eq(waOutboxTable.id, id),
            inArray(waOutboxTable.status, from),
          ),
        )
        .returning(),
    );
    return row;
  },

  async deleteOutbox(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(waOutboxTable)
        .where(and(eq(waOutboxTable.tenantId, ctx.tenantId), eq(waOutboxTable.id, id)))
        .returning({ id: waOutboxTable.id }),
    );
    return rows.length > 0;
  },
};
