import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { extensionCommandTable, type ExtensionCommandRow, type ExtensionCommandInsert } from "./schema";

/**
 * extension_command repo — the ONLY place that touches the `extension_command`
 * table. TENANT-scoped: every read/write is wrapped in `withTenant` and pinned to
 * `ctx.tenantId` (RLS tenant_isolation applies under the NOBYPASSRLS role).
 *
 * `claim` mirrors agent-task's: it flips the oldest N `queued` rows to `claimed`
 * ATOMICALLY via `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`, so two
 * concurrent pollers never grab the same command. It ADDITIONALLY filters on
 * `target_user_id IS NULL OR target_user_id = <userId>` so a command addressed to
 * a specific rep is only handed to that rep's poll.
 */
export const extCommandRepo = {
  async insert(ctx: TenantContext, values: ExtensionCommandInsert): Promise<ExtensionCommandRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(extensionCommandTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async getById(ctx: TenantContext, id: string): Promise<ExtensionCommandRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(extensionCommandTable)
        .where(
          and(
            eq(extensionCommandTable.id, id),
            eq(extensionCommandTable.tenantId, ctx.tenantId),
            isNull(extensionCommandTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /**
   * Atomically claim up to `limit` of the OLDEST queued commands for the tenant
   * that this rep may run (`target_user_id IS NULL OR = userId`). Flips them →
   * `claimed` (stamps claimed_at + claimed_by = userId) and returns the rows.
   * `FOR UPDATE SKIP LOCKED` inside the sub-select makes concurrent pollers safe.
   */
  async claimForUser(
    ctx: TenantContext,
    userId: string,
    limit: number,
  ): Promise<ExtensionCommandRow[]> {
    const res = await withTenant(ctx, (tx) =>
      tx.execute(sql`
        update extension_command
        set status = 'claimed', claimed_at = now(), claimed_by = ${userId}
        where id in (
          select id from extension_command
          where tenant_id = ${ctx.tenantId}
            and status = 'queued'
            and deleted_at is null
            and (target_user_id is null or target_user_id = ${userId})
          order by created_at asc
          for update skip locked
          limit ${limit}
        )
        returning id, tenant_id, target_user_id, type, params, status, result,
                  error, claimed_by, created_at, claimed_at, finished_at, deleted_at
      `),
    );
    return (res.rows as unknown as RawRow[]).map(mapRawRow);
  },

  /**
   * Finish a CLAIMED command — set `done`+result or `failed`+error and stamp
   * finished_at. Only matches a live, currently-claimed row in this tenant
   * (idempotency guard). Returns the updated row or undefined when nothing matched.
   */
  async finish(
    ctx: TenantContext,
    id: string,
    patch: { status: "done" | "failed"; result?: Record<string, unknown> | null; error?: string | null },
  ): Promise<ExtensionCommandRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(extensionCommandTable)
        .set({
          status: patch.status,
          result: patch.result ?? null,
          error: patch.error ?? null,
          finishedAt: new Date(),
        })
        .where(
          and(
            eq(extensionCommandTable.id, id),
            eq(extensionCommandTable.tenantId, ctx.tenantId),
            eq(extensionCommandTable.status, "claimed"),
            isNull(extensionCommandTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  /**
   * Live QUEUED commands this rep may run (non-claiming preview for the heartbeat
   * count / popup status). Oldest first, capped.
   */
  async listQueuedForUser(
    ctx: TenantContext,
    userId: string,
    limit = 20,
  ): Promise<ExtensionCommandRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(extensionCommandTable)
        .where(
          and(
            eq(extensionCommandTable.tenantId, ctx.tenantId),
            eq(extensionCommandTable.status, "queued"),
            isNull(extensionCommandTable.deletedAt),
            or(isNull(extensionCommandTable.targetUserId), eq(extensionCommandTable.targetUserId, userId)),
          ),
        )
        .orderBy(extensionCommandTable.createdAt)
        .limit(limit),
    );
  },

  /** Recent live commands for the tenant (debug/admin), newest first. */
  async list(
    ctx: TenantContext,
    filter?: { status?: string },
    limit = 50,
  ): Promise<ExtensionCommandRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(extensionCommandTable)
        .where(
          and(
            eq(extensionCommandTable.tenantId, ctx.tenantId),
            isNull(extensionCommandTable.deletedAt),
            filter?.status ? eq(extensionCommandTable.status, filter.status) : undefined,
          ),
        )
        .orderBy(desc(extensionCommandTable.createdAt))
        .limit(limit),
    );
  },
};

// ── raw-row mapping for the FOR UPDATE SKIP LOCKED claim ─────────────────────
// `tx.execute(sql`…`)` returns snake_case columns as plain values (no Drizzle
// column mapping), so map the raw row back onto the ExtensionCommandRow shape.
interface RawRow {
  id: string;
  tenant_id: string;
  target_user_id: string | null;
  type: string;
  params: Record<string, unknown> | null;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
  claimed_by: string | null;
  created_at: string | Date;
  claimed_at: string | Date | null;
  finished_at: string | Date | null;
  deleted_at: string | Date | null;
}

function toDate(v: string | Date | null): Date | null {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(v);
}

function mapRawRow(r: RawRow): ExtensionCommandRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    targetUserId: r.target_user_id,
    type: r.type,
    params: (r.params ?? {}) as Record<string, unknown>,
    status: r.status,
    result: r.result,
    error: r.error,
    claimedBy: r.claimed_by,
    createdAt: toDate(r.created_at) as Date,
    claimedAt: toDate(r.claimed_at),
    finishedAt: toDate(r.finished_at),
    deletedAt: toDate(r.deleted_at),
  };
}
