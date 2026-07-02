import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { agentTaskTable, type AgentTaskRow, type AgentTaskInsert } from "./schema";

/**
 * agent_task repo — the ONLY place that touches the `agent_task` table. TENANT-
 * scoped, so every read/write is wrapped in `withTenant` and pinned to
 * `ctx.tenantId` (RLS tenant_isolation applies under the NOBYPASSRLS role).
 *
 * `claim` is the interesting one: it flips the oldest N `queued` rows to `claimed`
 * ATOMICALLY. `withTenant` runs the callback in a single transaction, and the
 * `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT n) RETURNING`
 * statement locks exactly the rows it takes and SKIPS rows another poller already
 * locked — so concurrent pollers never grab the same task, and neither blocks the
 * other.
 */
export const agentTaskRepo = {
  async insert(ctx: TenantContext, values: AgentTaskInsert): Promise<AgentTaskRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(agentTaskTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async getById(ctx: TenantContext, id: string): Promise<AgentTaskRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(agentTaskTable)
        .where(
          and(
            eq(agentTaskTable.id, id),
            eq(agentTaskTable.tenantId, ctx.tenantId),
            isNull(agentTaskTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /**
   * Atomically claim up to `limit` of the OLDEST queued tasks for the tenant.
   * Flips them → `claimed` (stamps claimed_at + claimed_by) and returns the rows.
   * `FOR UPDATE SKIP LOCKED` inside the sub-select is what makes two concurrent
   * pollers safe: each takes a disjoint set, neither waits on the other.
   */
  async claim(ctx: TenantContext, limit: number, claimedBy: string): Promise<AgentTaskRow[]> {
    const res = await withTenant(ctx, (tx) =>
      tx.execute(sql`
        update agent_task
        set status = 'claimed', claimed_at = now(), claimed_by = ${claimedBy}
        where id in (
          select id from agent_task
          where tenant_id = ${ctx.tenantId}
            and status = 'queued'
            and deleted_at is null
          order by created_at asc
          for update skip locked
          limit ${limit}
        )
        returning id, tenant_id, type, status, payload, result, error,
                  ref_type, ref_id, claimed_by, created_at, claimed_at,
                  finished_at, deleted_at
      `),
    );
    return (res.rows as unknown as RawAgentTaskRow[]).map(mapRawRow);
  },

  /**
   * Finish a CLAIMED task — set `done`+result or `failed`+error and stamp
   * finished_at. Only matches a live, currently-claimed row in this tenant
   * (idempotency guard: a done/failed row won't be re-finished). Returns the
   * updated row or undefined when nothing matched.
   */
  async finish(
    ctx: TenantContext,
    id: string,
    patch: { status: "done" | "failed"; result?: Record<string, unknown> | null; error?: string | null },
  ): Promise<AgentTaskRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(agentTaskTable)
        .set({
          status: patch.status,
          result: patch.result ?? null,
          error: patch.error ?? null,
          finishedAt: new Date(),
        })
        .where(
          and(
            eq(agentTaskTable.id, id),
            eq(agentTaskTable.tenantId, ctx.tenantId),
            eq(agentTaskTable.status, "claimed"),
            isNull(agentTaskTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  /** Recent live tasks for the tenant (debug/admin), newest first. */
  async list(
    ctx: TenantContext,
    filter?: { status?: string },
    limit = 50,
  ): Promise<AgentTaskRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(agentTaskTable)
        .where(
          and(
            eq(agentTaskTable.tenantId, ctx.tenantId),
            isNull(agentTaskTable.deletedAt),
            filter?.status ? eq(agentTaskTable.status, filter.status) : undefined,
          ),
        )
        .orderBy(desc(agentTaskTable.createdAt))
        .limit(limit),
    );
  },
};

// ── raw-row mapping for the FOR UPDATE SKIP LOCKED claim ─────────────────────
// `tx.execute(sql`…`)` returns snake_case columns as plain values (no Drizzle
// column mapping), so we map the raw row back onto the AgentTaskRow shape.
interface RawAgentTaskRow {
  id: string;
  tenant_id: string;
  type: string;
  status: string;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
  ref_type: string | null;
  ref_id: string | null;
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

function mapRawRow(r: RawAgentTaskRow): AgentTaskRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    type: r.type,
    status: r.status,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    result: r.result,
    error: r.error,
    refType: r.ref_type,
    refId: r.ref_id,
    claimedBy: r.claimed_by,
    createdAt: toDate(r.created_at) as Date,
    claimedAt: toDate(r.claimed_at),
    finishedAt: toDate(r.finished_at),
    deletedAt: toDate(r.deleted_at),
  };
}
