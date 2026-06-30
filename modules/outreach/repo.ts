import { and, asc, count, desc, eq, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  cadenceTable,
  cadenceStepTable,
  cadenceEnrollmentTable,
  autopilotRunTable,
  escalationTable,
  handoffTable,
  type CadenceRow,
  type CadenceInsert,
  type CadenceStepRow,
  type CadenceStepInsert,
  type CadenceEnrollmentRow,
  type CadenceEnrollmentInsert,
  type AutopilotRunRow,
  type AutopilotRunInsert,
  type EscalationRow,
  type EscalationInsert,
  type HandoffRow,
  type HandoffInsert,
} from "./schema";

/**
 * outreach repo — the ONLY place that touches the six outreach tables
 * (`cadence_v2`, `cadence_step_v2`, `cadence_enrollment_v2`, `autopilot_run_v2`,
 * `escalation`, `handoff`). All are TENANT-scoped, so every read/write is wrapped
 * in `withTenant` and filtered by `tenant_id`.
 *
 * Each entity exposes the standard list/get/insert/update + soft-delete contract:
 *   - list / get reads filter `deleted_at IS NULL`;
 *   - `listTrashed*` flips to `deleted_at IS NOT NULL` (restore candidates);
 *   - `softDelete*` sets `deleted_at=now()` (only matches live rows);
 *   - `restore*` clears it (only matches trashed rows);
 *   - `hardDelete*` permanently removes the row.
 * No FKs — cross-entity integrity + cascade live in the service layer.
 */
export const outreachRepo = {
  // ═══════════════════════ cadence_v2 ═══════════════════════════════
  async listCadences(
    ctx: TenantContext,
    filter?: { workspaceId?: string; status?: string },
  ): Promise<CadenceRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cadenceTable)
        .where(
          and(
            eq(cadenceTable.tenantId, ctx.tenantId),
            isNull(cadenceTable.deletedAt),
            filter?.workspaceId ? eq(cadenceTable.workspaceId, filter.workspaceId) : undefined,
            filter?.status ? eq(cadenceTable.status, filter.status) : undefined,
          ),
        )
        .orderBy(desc(cadenceTable.updatedAt)),
    );
  },

  async listTrashedCadences(ctx: TenantContext): Promise<CadenceRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cadenceTable)
        .where(and(eq(cadenceTable.tenantId, ctx.tenantId), isNotNull(cadenceTable.deletedAt)))
        .orderBy(desc(cadenceTable.deletedAt)),
    );
  },

  async getCadence(ctx: TenantContext, id: string): Promise<CadenceRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cadenceTable)
        .where(
          and(
            eq(cadenceTable.tenantId, ctx.tenantId),
            eq(cadenceTable.id, id),
            isNull(cadenceTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertCadence(ctx: TenantContext, values: CadenceInsert): Promise<CadenceRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(cadenceTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateCadence(
    ctx: TenantContext,
    id: string,
    patch: Partial<CadenceInsert>,
  ): Promise<CadenceRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(cadenceTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(cadenceTable.tenantId, ctx.tenantId),
            eq(cadenceTable.id, id),
            isNull(cadenceTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteCadence(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(cadenceTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(cadenceTable.tenantId, ctx.tenantId),
            eq(cadenceTable.id, id),
            isNull(cadenceTable.deletedAt),
          ),
        )
        .returning({ id: cadenceTable.id }),
    );
    return rows.length > 0;
  },

  async restoreCadence(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(cadenceTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(cadenceTable.tenantId, ctx.tenantId),
            eq(cadenceTable.id, id),
            isNotNull(cadenceTable.deletedAt),
          ),
        )
        .returning({ id: cadenceTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteCadence(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(cadenceTable)
        .where(and(eq(cadenceTable.tenantId, ctx.tenantId), eq(cadenceTable.id, id)))
        .returning({ id: cadenceTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ cadence_step_v2 ══════════════════════════
  async listSteps(ctx: TenantContext, cadenceId: string): Promise<CadenceStepRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cadenceStepTable)
        .where(
          and(
            eq(cadenceStepTable.tenantId, ctx.tenantId),
            eq(cadenceStepTable.cadenceId, cadenceId),
            isNull(cadenceStepTable.deletedAt),
          ),
        )
        .orderBy(asc(cadenceStepTable.sort), asc(cadenceStepTable.createdAt)),
    );
  },

  /** Count LIVE steps of a cadence — drives the denormalized `step_count`. */
  async countSteps(ctx: TenantContext, cadenceId: string): Promise<number> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select({ n: count() })
        .from(cadenceStepTable)
        .where(
          and(
            eq(cadenceStepTable.tenantId, ctx.tenantId),
            eq(cadenceStepTable.cadenceId, cadenceId),
            isNull(cadenceStepTable.deletedAt),
          ),
        ),
    );
    return row?.n ?? 0;
  },

  /**
   * Atomically adjust a cadence's denormalized `step_count` by `delta` (+1 on
   * add/restore, -1 on delete) in ONE statement — no scan, no read-modify-write
   * race. Floors at 0 so a redundant decrement can't push it negative.
   */
  async bumpStepCount(ctx: TenantContext, cadenceId: string, delta: number): Promise<void> {
    if (delta === 0) return;
    await withTenant(ctx, (tx) =>
      tx
        .update(cadenceTable)
        .set({
          stepCount: sql`GREATEST(0, ${cadenceTable.stepCount} + ${delta})`,
          updatedAt: new Date(),
        })
        .where(and(eq(cadenceTable.tenantId, ctx.tenantId), eq(cadenceTable.id, cadenceId))),
    );
  },

  async listTrashedSteps(ctx: TenantContext): Promise<CadenceStepRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cadenceStepTable)
        .where(
          and(eq(cadenceStepTable.tenantId, ctx.tenantId), isNotNull(cadenceStepTable.deletedAt)),
        )
        .orderBy(desc(cadenceStepTable.deletedAt)),
    );
  },

  async getStep(ctx: TenantContext, id: string): Promise<CadenceStepRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cadenceStepTable)
        .where(
          and(
            eq(cadenceStepTable.tenantId, ctx.tenantId),
            eq(cadenceStepTable.id, id),
            isNull(cadenceStepTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertStep(ctx: TenantContext, values: CadenceStepInsert): Promise<CadenceStepRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(cadenceStepTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateStep(
    ctx: TenantContext,
    id: string,
    patch: Partial<CadenceStepInsert>,
  ): Promise<CadenceStepRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(cadenceStepTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(cadenceStepTable.tenantId, ctx.tenantId),
            eq(cadenceStepTable.id, id),
            isNull(cadenceStepTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteStep(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(cadenceStepTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(cadenceStepTable.tenantId, ctx.tenantId),
            eq(cadenceStepTable.id, id),
            isNull(cadenceStepTable.deletedAt),
          ),
        )
        .returning({ id: cadenceStepTable.id }),
    );
    return rows.length > 0;
  },

  async restoreStep(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(cadenceStepTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(cadenceStepTable.tenantId, ctx.tenantId),
            eq(cadenceStepTable.id, id),
            isNotNull(cadenceStepTable.deletedAt),
          ),
        )
        .returning({ id: cadenceStepTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteStep(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(cadenceStepTable)
        .where(and(eq(cadenceStepTable.tenantId, ctx.tenantId), eq(cadenceStepTable.id, id)))
        .returning({ id: cadenceStepTable.id }),
    );
    return rows.length > 0;
  },

  /** Cascade helper: flip deleted_at on every step of a cadence (delete/restore). */
  async setStepsDeletedByCadence(
    ctx: TenantContext,
    cadenceId: string,
    deleted: boolean,
  ): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .update(cadenceStepTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(cadenceStepTable.tenantId, ctx.tenantId),
            eq(cadenceStepTable.cadenceId, cadenceId),
            deleted ? isNull(cadenceStepTable.deletedAt) : isNotNull(cadenceStepTable.deletedAt),
          ),
        ),
    );
  },

  async hardDeleteStepsByCadence(ctx: TenantContext, cadenceId: string): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .delete(cadenceStepTable)
        .where(
          and(
            eq(cadenceStepTable.tenantId, ctx.tenantId),
            eq(cadenceStepTable.cadenceId, cadenceId),
          ),
        ),
    );
  },

  // ═══════════════════════ cadence_enrollment_v2 ════════════════════
  async listEnrollments(
    ctx: TenantContext,
    filter?: { cadenceId?: string; contactId?: string; status?: string },
  ): Promise<CadenceEnrollmentRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cadenceEnrollmentTable)
        .where(
          and(
            eq(cadenceEnrollmentTable.tenantId, ctx.tenantId),
            isNull(cadenceEnrollmentTable.deletedAt),
            filter?.cadenceId
              ? eq(cadenceEnrollmentTable.cadenceId, filter.cadenceId)
              : undefined,
            filter?.contactId
              ? eq(cadenceEnrollmentTable.contactId, filter.contactId)
              : undefined,
            filter?.status ? eq(cadenceEnrollmentTable.status, filter.status) : undefined,
          ),
        )
        .orderBy(desc(cadenceEnrollmentTable.updatedAt)),
    );
  },

  /** Enrollments DUE to run: active + next_run_at <= now. The processor reads this. */
  async listDueEnrollments(
    ctx: TenantContext,
    now: Date,
    limit = 100,
  ): Promise<CadenceEnrollmentRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cadenceEnrollmentTable)
        .where(
          and(
            eq(cadenceEnrollmentTable.tenantId, ctx.tenantId),
            isNull(cadenceEnrollmentTable.deletedAt),
            eq(cadenceEnrollmentTable.status, "active"),
            lte(cadenceEnrollmentTable.nextRunAt, now),
          ),
        )
        .orderBy(asc(cadenceEnrollmentTable.nextRunAt))
        .limit(limit),
    );
  },

  async listTrashedEnrollments(ctx: TenantContext): Promise<CadenceEnrollmentRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cadenceEnrollmentTable)
        .where(
          and(
            eq(cadenceEnrollmentTable.tenantId, ctx.tenantId),
            isNotNull(cadenceEnrollmentTable.deletedAt),
          ),
        )
        .orderBy(desc(cadenceEnrollmentTable.deletedAt)),
    );
  },

  async getEnrollment(
    ctx: TenantContext,
    id: string,
  ): Promise<CadenceEnrollmentRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cadenceEnrollmentTable)
        .where(
          and(
            eq(cadenceEnrollmentTable.tenantId, ctx.tenantId),
            eq(cadenceEnrollmentTable.id, id),
            isNull(cadenceEnrollmentTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async findEnrollmentByContact(
    ctx: TenantContext,
    cadenceId: string,
    contactId: string,
  ): Promise<CadenceEnrollmentRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(cadenceEnrollmentTable)
        .where(
          and(
            eq(cadenceEnrollmentTable.tenantId, ctx.tenantId),
            eq(cadenceEnrollmentTable.cadenceId, cadenceId),
            eq(cadenceEnrollmentTable.contactId, contactId),
            isNull(cadenceEnrollmentTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Upsert the (cadence, contact) enrollment — re-enroll reuses the row. */
  async upsertEnrollment(
    ctx: TenantContext,
    cadenceId: string,
    contactId: string,
    values: Omit<CadenceEnrollmentInsert, "id" | "tenantId" | "cadenceId" | "contactId">,
  ): Promise<CadenceEnrollmentRow> {
    const id = "cen_" + crypto.randomUUID();
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(cadenceEnrollmentTable)
        .values({ ...values, id, tenantId: ctx.tenantId, cadenceId, contactId })
        .onConflictDoUpdate({
          target: [
            cadenceEnrollmentTable.tenantId,
            cadenceEnrollmentTable.cadenceId,
            cadenceEnrollmentTable.contactId,
          ],
          set: { ...values, deletedAt: null, updatedAt: new Date() },
        })
        .returning(),
    );
    return row;
  },

  async updateEnrollment(
    ctx: TenantContext,
    id: string,
    patch: Partial<CadenceEnrollmentInsert>,
  ): Promise<CadenceEnrollmentRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(cadenceEnrollmentTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(cadenceEnrollmentTable.tenantId, ctx.tenantId),
            eq(cadenceEnrollmentTable.id, id),
            isNull(cadenceEnrollmentTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteEnrollment(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(cadenceEnrollmentTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(cadenceEnrollmentTable.tenantId, ctx.tenantId),
            eq(cadenceEnrollmentTable.id, id),
            isNull(cadenceEnrollmentTable.deletedAt),
          ),
        )
        .returning({ id: cadenceEnrollmentTable.id }),
    );
    return rows.length > 0;
  },

  async restoreEnrollment(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(cadenceEnrollmentTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(cadenceEnrollmentTable.tenantId, ctx.tenantId),
            eq(cadenceEnrollmentTable.id, id),
            isNotNull(cadenceEnrollmentTable.deletedAt),
          ),
        )
        .returning({ id: cadenceEnrollmentTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteEnrollment(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(cadenceEnrollmentTable)
        .where(
          and(
            eq(cadenceEnrollmentTable.tenantId, ctx.tenantId),
            eq(cadenceEnrollmentTable.id, id),
          ),
        )
        .returning({ id: cadenceEnrollmentTable.id }),
    );
    return rows.length > 0;
  },

  /** Cascade helper: flip deleted_at on every enrollment of a cadence. */
  async setEnrollmentsDeletedByCadence(
    ctx: TenantContext,
    cadenceId: string,
    deleted: boolean,
  ): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .update(cadenceEnrollmentTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(cadenceEnrollmentTable.tenantId, ctx.tenantId),
            eq(cadenceEnrollmentTable.cadenceId, cadenceId),
            deleted
              ? isNull(cadenceEnrollmentTable.deletedAt)
              : isNotNull(cadenceEnrollmentTable.deletedAt),
          ),
        ),
    );
  },

  async hardDeleteEnrollmentsByCadence(ctx: TenantContext, cadenceId: string): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .delete(cadenceEnrollmentTable)
        .where(
          and(
            eq(cadenceEnrollmentTable.tenantId, ctx.tenantId),
            eq(cadenceEnrollmentTable.cadenceId, cadenceId),
          ),
        ),
    );
  },

  // ═══════════════════════ autopilot_run_v2 ═════════════════════════
  async listRuns(
    ctx: TenantContext,
    filter?: { conversationId?: string; contactId?: string; status?: string; mode?: string },
  ): Promise<AutopilotRunRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(autopilotRunTable)
        .where(
          and(
            eq(autopilotRunTable.tenantId, ctx.tenantId),
            isNull(autopilotRunTable.deletedAt),
            filter?.conversationId
              ? eq(autopilotRunTable.conversationId, filter.conversationId)
              : undefined,
            filter?.contactId ? eq(autopilotRunTable.contactId, filter.contactId) : undefined,
            filter?.status ? eq(autopilotRunTable.status, filter.status) : undefined,
            filter?.mode ? eq(autopilotRunTable.mode, filter.mode) : undefined,
          ),
        )
        .orderBy(desc(autopilotRunTable.createdAt)),
    );
  },

  async listTrashedRuns(ctx: TenantContext): Promise<AutopilotRunRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(autopilotRunTable)
        .where(
          and(eq(autopilotRunTable.tenantId, ctx.tenantId), isNotNull(autopilotRunTable.deletedAt)),
        )
        .orderBy(desc(autopilotRunTable.deletedAt)),
    );
  },

  async getRun(ctx: TenantContext, id: string): Promise<AutopilotRunRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(autopilotRunTable)
        .where(
          and(
            eq(autopilotRunTable.tenantId, ctx.tenantId),
            eq(autopilotRunTable.id, id),
            isNull(autopilotRunTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertRun(ctx: TenantContext, values: AutopilotRunInsert): Promise<AutopilotRunRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(autopilotRunTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateRun(
    ctx: TenantContext,
    id: string,
    patch: Partial<AutopilotRunInsert>,
  ): Promise<AutopilotRunRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(autopilotRunTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(autopilotRunTable.tenantId, ctx.tenantId),
            eq(autopilotRunTable.id, id),
            isNull(autopilotRunTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteRun(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(autopilotRunTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(autopilotRunTable.tenantId, ctx.tenantId),
            eq(autopilotRunTable.id, id),
            isNull(autopilotRunTable.deletedAt),
          ),
        )
        .returning({ id: autopilotRunTable.id }),
    );
    return rows.length > 0;
  },

  async restoreRun(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(autopilotRunTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(autopilotRunTable.tenantId, ctx.tenantId),
            eq(autopilotRunTable.id, id),
            isNotNull(autopilotRunTable.deletedAt),
          ),
        )
        .returning({ id: autopilotRunTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteRun(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(autopilotRunTable)
        .where(and(eq(autopilotRunTable.tenantId, ctx.tenantId), eq(autopilotRunTable.id, id)))
        .returning({ id: autopilotRunTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ escalation ═══════════════════════════════
  async listEscalations(
    ctx: TenantContext,
    filter?: { conversationId?: string; status?: string; assignedUserId?: string },
  ): Promise<EscalationRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(escalationTable)
        .where(
          and(
            eq(escalationTable.tenantId, ctx.tenantId),
            isNull(escalationTable.deletedAt),
            filter?.conversationId
              ? eq(escalationTable.conversationId, filter.conversationId)
              : undefined,
            filter?.status ? eq(escalationTable.status, filter.status) : undefined,
            filter?.assignedUserId
              ? eq(escalationTable.assignedUserId, filter.assignedUserId)
              : undefined,
          ),
        )
        .orderBy(desc(escalationTable.createdAt)),
    );
  },

  async listTrashedEscalations(ctx: TenantContext): Promise<EscalationRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(escalationTable)
        .where(
          and(eq(escalationTable.tenantId, ctx.tenantId), isNotNull(escalationTable.deletedAt)),
        )
        .orderBy(desc(escalationTable.deletedAt)),
    );
  },

  async getEscalation(ctx: TenantContext, id: string): Promise<EscalationRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(escalationTable)
        .where(
          and(
            eq(escalationTable.tenantId, ctx.tenantId),
            eq(escalationTable.id, id),
            isNull(escalationTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Find an OPEN escalation for a conversation (dedup on raise). */
  async findOpenEscalation(
    ctx: TenantContext,
    conversationId: string,
  ): Promise<EscalationRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(escalationTable)
        .where(
          and(
            eq(escalationTable.tenantId, ctx.tenantId),
            eq(escalationTable.conversationId, conversationId),
            ne(escalationTable.status, "resolved"),
            ne(escalationTable.status, "dismissed"),
            isNull(escalationTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertEscalation(ctx: TenantContext, values: EscalationInsert): Promise<EscalationRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(escalationTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateEscalation(
    ctx: TenantContext,
    id: string,
    patch: Partial<EscalationInsert>,
  ): Promise<EscalationRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(escalationTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(escalationTable.tenantId, ctx.tenantId),
            eq(escalationTable.id, id),
            isNull(escalationTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteEscalation(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(escalationTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(escalationTable.tenantId, ctx.tenantId),
            eq(escalationTable.id, id),
            isNull(escalationTable.deletedAt),
          ),
        )
        .returning({ id: escalationTable.id }),
    );
    return rows.length > 0;
  },

  async restoreEscalation(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(escalationTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(escalationTable.tenantId, ctx.tenantId),
            eq(escalationTable.id, id),
            isNotNull(escalationTable.deletedAt),
          ),
        )
        .returning({ id: escalationTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteEscalation(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(escalationTable)
        .where(and(eq(escalationTable.tenantId, ctx.tenantId), eq(escalationTable.id, id)))
        .returning({ id: escalationTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ handoff ══════════════════════════════════
  async listHandoffs(
    ctx: TenantContext,
    filter?: { conversationId?: string; status?: string; assignedUserId?: string },
  ): Promise<HandoffRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(handoffTable)
        .where(
          and(
            eq(handoffTable.tenantId, ctx.tenantId),
            isNull(handoffTable.deletedAt),
            filter?.conversationId
              ? eq(handoffTable.conversationId, filter.conversationId)
              : undefined,
            filter?.status ? eq(handoffTable.status, filter.status) : undefined,
            filter?.assignedUserId
              ? eq(handoffTable.assignedUserId, filter.assignedUserId)
              : undefined,
          ),
        )
        .orderBy(asc(handoffTable.dueAt), desc(handoffTable.createdAt)),
    );
  },

  async listTrashedHandoffs(ctx: TenantContext): Promise<HandoffRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(handoffTable)
        .where(and(eq(handoffTable.tenantId, ctx.tenantId), isNotNull(handoffTable.deletedAt)))
        .orderBy(desc(handoffTable.deletedAt)),
    );
  },

  async getHandoff(ctx: TenantContext, id: string): Promise<HandoffRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(handoffTable)
        .where(
          and(
            eq(handoffTable.tenantId, ctx.tenantId),
            eq(handoffTable.id, id),
            isNull(handoffTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertHandoff(ctx: TenantContext, values: HandoffInsert): Promise<HandoffRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(handoffTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateHandoff(
    ctx: TenantContext,
    id: string,
    patch: Partial<HandoffInsert>,
  ): Promise<HandoffRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(handoffTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(handoffTable.tenantId, ctx.tenantId),
            eq(handoffTable.id, id),
            isNull(handoffTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteHandoff(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(handoffTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(handoffTable.tenantId, ctx.tenantId),
            eq(handoffTable.id, id),
            isNull(handoffTable.deletedAt),
          ),
        )
        .returning({ id: handoffTable.id }),
    );
    return rows.length > 0;
  },

  async restoreHandoff(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(handoffTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(handoffTable.tenantId, ctx.tenantId),
            eq(handoffTable.id, id),
            isNotNull(handoffTable.deletedAt),
          ),
        )
        .returning({ id: handoffTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteHandoff(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(handoffTable)
        .where(and(eq(handoffTable.tenantId, ctx.tenantId), eq(handoffTable.id, id)))
        .returning({ id: handoffTable.id }),
    );
    return rows.length > 0;
  },
};
