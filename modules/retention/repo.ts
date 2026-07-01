import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  retentionFlowTable,
  retentionStepTable,
  retentionEnrollmentTable,
  type RetentionFlowRow,
  type RetentionFlowInsert,
  type RetentionStepRow,
  type RetentionStepInsert,
  type RetentionEnrollmentRow,
  type RetentionEnrollmentInsert,
} from "./schema";

/**
 * retention repo — the ONLY place that touches the two retention tables
 * (`retention_flow`, `retention_step`). Both are TENANT-scoped, so every
 * read/write is wrapped in `withTenant` and filtered by `tenant_id`.
 *
 * Standard list/get/insert/update + soft-delete contract per entity:
 *   - list / get reads filter `deleted_at IS NULL`;
 *   - `listTrashed*` flips to `deleted_at IS NOT NULL`;
 *   - `softDelete*` / `restore*` flip `deleted_at`; `hardDelete*` removes the row.
 * No FKs — cross-entity integrity + cascade live in the service layer.
 */
export const retentionRepo = {
  // ═══════════════════════ retention_flow ═══════════════════════════
  async listFlows(
    ctx: TenantContext,
    filter?: { workspaceId?: string; kind?: string; status?: string },
  ): Promise<RetentionFlowRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(retentionFlowTable)
        .where(
          and(
            eq(retentionFlowTable.tenantId, ctx.tenantId),
            isNull(retentionFlowTable.deletedAt),
            filter?.workspaceId ? eq(retentionFlowTable.workspaceId, filter.workspaceId) : undefined,
            filter?.kind ? eq(retentionFlowTable.kind, filter.kind) : undefined,
            filter?.status ? eq(retentionFlowTable.status, filter.status) : undefined,
          ),
        )
        .orderBy(desc(retentionFlowTable.updatedAt)),
    );
  },

  async listTrashedFlows(ctx: TenantContext): Promise<RetentionFlowRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(retentionFlowTable)
        .where(
          and(eq(retentionFlowTable.tenantId, ctx.tenantId), isNotNull(retentionFlowTable.deletedAt)),
        )
        .orderBy(desc(retentionFlowTable.deletedAt)),
    );
  },

  async getFlow(ctx: TenantContext, id: string): Promise<RetentionFlowRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(retentionFlowTable)
        .where(
          and(
            eq(retentionFlowTable.tenantId, ctx.tenantId),
            eq(retentionFlowTable.id, id),
            isNull(retentionFlowTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertFlow(ctx: TenantContext, values: RetentionFlowInsert): Promise<RetentionFlowRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(retentionFlowTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateFlow(
    ctx: TenantContext,
    id: string,
    patch: Partial<RetentionFlowInsert>,
  ): Promise<RetentionFlowRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(retentionFlowTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(retentionFlowTable.tenantId, ctx.tenantId),
            eq(retentionFlowTable.id, id),
            isNull(retentionFlowTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteFlow(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(retentionFlowTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(retentionFlowTable.tenantId, ctx.tenantId),
            eq(retentionFlowTable.id, id),
            isNull(retentionFlowTable.deletedAt),
          ),
        )
        .returning({ id: retentionFlowTable.id }),
    );
    return rows.length > 0;
  },

  async restoreFlow(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(retentionFlowTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(retentionFlowTable.tenantId, ctx.tenantId),
            eq(retentionFlowTable.id, id),
            isNotNull(retentionFlowTable.deletedAt),
          ),
        )
        .returning({ id: retentionFlowTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteFlow(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(retentionFlowTable)
        .where(and(eq(retentionFlowTable.tenantId, ctx.tenantId), eq(retentionFlowTable.id, id)))
        .returning({ id: retentionFlowTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ retention_step ═══════════════════════════
  async listSteps(ctx: TenantContext, flowId: string): Promise<RetentionStepRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(retentionStepTable)
        .where(
          and(
            eq(retentionStepTable.tenantId, ctx.tenantId),
            eq(retentionStepTable.flowId, flowId),
            isNull(retentionStepTable.deletedAt),
          ),
        )
        .orderBy(asc(retentionStepTable.sort), asc(retentionStepTable.createdAt)),
    );
  },

  /** Count LIVE steps of a flow — drives the denormalized `step_count`. */
  async countSteps(ctx: TenantContext, flowId: string): Promise<number> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({ id: retentionStepTable.id })
        .from(retentionStepTable)
        .where(
          and(
            eq(retentionStepTable.tenantId, ctx.tenantId),
            eq(retentionStepTable.flowId, flowId),
            isNull(retentionStepTable.deletedAt),
          ),
        ),
    );
    return rows.length;
  },

  async listTrashedSteps(ctx: TenantContext): Promise<RetentionStepRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(retentionStepTable)
        .where(
          and(eq(retentionStepTable.tenantId, ctx.tenantId), isNotNull(retentionStepTable.deletedAt)),
        )
        .orderBy(desc(retentionStepTable.deletedAt)),
    );
  },

  async getStep(ctx: TenantContext, id: string): Promise<RetentionStepRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(retentionStepTable)
        .where(
          and(
            eq(retentionStepTable.tenantId, ctx.tenantId),
            eq(retentionStepTable.id, id),
            isNull(retentionStepTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertStep(ctx: TenantContext, values: RetentionStepInsert): Promise<RetentionStepRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(retentionStepTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateStep(
    ctx: TenantContext,
    id: string,
    patch: Partial<RetentionStepInsert>,
  ): Promise<RetentionStepRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(retentionStepTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(retentionStepTable.tenantId, ctx.tenantId),
            eq(retentionStepTable.id, id),
            isNull(retentionStepTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteStep(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(retentionStepTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(retentionStepTable.tenantId, ctx.tenantId),
            eq(retentionStepTable.id, id),
            isNull(retentionStepTable.deletedAt),
          ),
        )
        .returning({ id: retentionStepTable.id }),
    );
    return rows.length > 0;
  },

  async restoreStep(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(retentionStepTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(retentionStepTable.tenantId, ctx.tenantId),
            eq(retentionStepTable.id, id),
            isNotNull(retentionStepTable.deletedAt),
          ),
        )
        .returning({ id: retentionStepTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteStep(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(retentionStepTable)
        .where(and(eq(retentionStepTable.tenantId, ctx.tenantId), eq(retentionStepTable.id, id)))
        .returning({ id: retentionStepTable.id }),
    );
    return rows.length > 0;
  },

  /** Cascade helper: flip deleted_at on every step of a flow (delete/restore). */
  async setStepsDeletedByFlow(
    ctx: TenantContext,
    flowId: string,
    deleted: boolean,
  ): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .update(retentionStepTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(retentionStepTable.tenantId, ctx.tenantId),
            eq(retentionStepTable.flowId, flowId),
            deleted ? isNull(retentionStepTable.deletedAt) : isNotNull(retentionStepTable.deletedAt),
          ),
        ),
    );
  },

  async hardDeleteStepsByFlow(ctx: TenantContext, flowId: string): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .delete(retentionStepTable)
        .where(
          and(eq(retentionStepTable.tenantId, ctx.tenantId), eq(retentionStepTable.flowId, flowId)),
        ),
    );
  },

  // ═══════════════════════ retention_enrollment ═════════════════════
  async listEnrollments(
    ctx: TenantContext,
    filter?: { flowId?: string; contactId?: string; status?: string },
  ): Promise<RetentionEnrollmentRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(retentionEnrollmentTable)
        .where(
          and(
            eq(retentionEnrollmentTable.tenantId, ctx.tenantId),
            isNull(retentionEnrollmentTable.deletedAt),
            filter?.flowId ? eq(retentionEnrollmentTable.flowId, filter.flowId) : undefined,
            filter?.contactId
              ? eq(retentionEnrollmentTable.contactId, filter.contactId)
              : undefined,
            filter?.status ? eq(retentionEnrollmentTable.status, filter.status) : undefined,
          ),
        )
        .orderBy(desc(retentionEnrollmentTable.updatedAt)),
    );
  },

  async getEnrollment(
    ctx: TenantContext,
    id: string,
  ): Promise<RetentionEnrollmentRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(retentionEnrollmentTable)
        .where(
          and(
            eq(retentionEnrollmentTable.tenantId, ctx.tenantId),
            eq(retentionEnrollmentTable.id, id),
            isNull(retentionEnrollmentTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Upsert the (flow, contact) enrollment — re-enroll reuses the row. */
  async upsertEnrollment(
    ctx: TenantContext,
    flowId: string,
    contactId: string,
    values: Omit<RetentionEnrollmentInsert, "id" | "tenantId" | "flowId" | "contactId">,
  ): Promise<RetentionEnrollmentRow> {
    const id = "ren_" + crypto.randomUUID();
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(retentionEnrollmentTable)
        .values({ ...values, id, tenantId: ctx.tenantId, flowId, contactId })
        .onConflictDoUpdate({
          target: [
            retentionEnrollmentTable.tenantId,
            retentionEnrollmentTable.flowId,
            retentionEnrollmentTable.contactId,
          ],
          set: { ...values, deletedAt: null, updatedAt: new Date() },
        })
        .returning(),
    );
    return row;
  },

  /** Cascade helper: flip deleted_at on every enrollment of a flow. */
  async setEnrollmentsDeletedByFlow(
    ctx: TenantContext,
    flowId: string,
    deleted: boolean,
  ): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .update(retentionEnrollmentTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(retentionEnrollmentTable.tenantId, ctx.tenantId),
            eq(retentionEnrollmentTable.flowId, flowId),
            deleted
              ? isNull(retentionEnrollmentTable.deletedAt)
              : isNotNull(retentionEnrollmentTable.deletedAt),
          ),
        ),
    );
  },

  async hardDeleteEnrollmentsByFlow(ctx: TenantContext, flowId: string): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .delete(retentionEnrollmentTable)
        .where(
          and(
            eq(retentionEnrollmentTable.tenantId, ctx.tenantId),
            eq(retentionEnrollmentTable.flowId, flowId),
          ),
        ),
    );
  },
};
