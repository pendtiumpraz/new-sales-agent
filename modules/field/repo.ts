import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  fieldVisitTable,
  fieldCheckInTable,
  type FieldVisitRow,
  type FieldVisitInsert,
  type FieldCheckInRow,
  type FieldCheckInInsert,
} from "./schema";

/**
 * field repo — the ONLY place that touches the two field tables (`field_visit`,
 * `field_check_in`). Both are TENANT-scoped, so every read/write is wrapped in
 * `withTenant` and filtered by `tenant_id`.
 *
 * Standard list/get/insert/update + soft-delete contract per entity. No FKs —
 * cross-entity integrity + cascade (check-ins under a visit) live in the service
 * layer.
 */
export const fieldRepo = {
  // ═══════════════════════ field_visit ══════════════════════════════
  async listVisits(
    ctx: TenantContext,
    filter?: { repUserId?: string; contactId?: string; status?: string; workspaceId?: string },
  ): Promise<FieldVisitRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(fieldVisitTable)
        .where(
          and(
            eq(fieldVisitTable.tenantId, ctx.tenantId),
            isNull(fieldVisitTable.deletedAt),
            filter?.repUserId ? eq(fieldVisitTable.repUserId, filter.repUserId) : undefined,
            filter?.contactId ? eq(fieldVisitTable.contactId, filter.contactId) : undefined,
            filter?.status ? eq(fieldVisitTable.status, filter.status) : undefined,
            filter?.workspaceId ? eq(fieldVisitTable.workspaceId, filter.workspaceId) : undefined,
          ),
        )
        .orderBy(desc(fieldVisitTable.scheduledAt), desc(fieldVisitTable.createdAt)),
    );
  },

  async listTrashedVisits(ctx: TenantContext): Promise<FieldVisitRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(fieldVisitTable)
        .where(and(eq(fieldVisitTable.tenantId, ctx.tenantId), isNotNull(fieldVisitTable.deletedAt)))
        .orderBy(desc(fieldVisitTable.deletedAt)),
    );
  },

  async getVisit(ctx: TenantContext, id: string): Promise<FieldVisitRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(fieldVisitTable)
        .where(
          and(
            eq(fieldVisitTable.tenantId, ctx.tenantId),
            eq(fieldVisitTable.id, id),
            isNull(fieldVisitTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertVisit(ctx: TenantContext, values: FieldVisitInsert): Promise<FieldVisitRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(fieldVisitTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateVisit(
    ctx: TenantContext,
    id: string,
    patch: Partial<FieldVisitInsert>,
  ): Promise<FieldVisitRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(fieldVisitTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(fieldVisitTable.tenantId, ctx.tenantId),
            eq(fieldVisitTable.id, id),
            isNull(fieldVisitTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteVisit(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(fieldVisitTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(fieldVisitTable.tenantId, ctx.tenantId),
            eq(fieldVisitTable.id, id),
            isNull(fieldVisitTable.deletedAt),
          ),
        )
        .returning({ id: fieldVisitTable.id }),
    );
    return rows.length > 0;
  },

  async restoreVisit(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(fieldVisitTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(fieldVisitTable.tenantId, ctx.tenantId),
            eq(fieldVisitTable.id, id),
            isNotNull(fieldVisitTable.deletedAt),
          ),
        )
        .returning({ id: fieldVisitTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteVisit(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(fieldVisitTable)
        .where(and(eq(fieldVisitTable.tenantId, ctx.tenantId), eq(fieldVisitTable.id, id)))
        .returning({ id: fieldVisitTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ field_check_in ═══════════════════════════
  async listCheckIns(ctx: TenantContext, visitId: string): Promise<FieldCheckInRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(fieldCheckInTable)
        .where(
          and(
            eq(fieldCheckInTable.tenantId, ctx.tenantId),
            eq(fieldCheckInTable.visitId, visitId),
            isNull(fieldCheckInTable.deletedAt),
          ),
        )
        .orderBy(asc(fieldCheckInTable.recordedAt)),
    );
  },

  async listTrashedCheckIns(ctx: TenantContext): Promise<FieldCheckInRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(fieldCheckInTable)
        .where(
          and(eq(fieldCheckInTable.tenantId, ctx.tenantId), isNotNull(fieldCheckInTable.deletedAt)),
        )
        .orderBy(desc(fieldCheckInTable.deletedAt)),
    );
  },

  async getCheckIn(ctx: TenantContext, id: string): Promise<FieldCheckInRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(fieldCheckInTable)
        .where(
          and(
            eq(fieldCheckInTable.tenantId, ctx.tenantId),
            eq(fieldCheckInTable.id, id),
            isNull(fieldCheckInTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertCheckIn(ctx: TenantContext, values: FieldCheckInInsert): Promise<FieldCheckInRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(fieldCheckInTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateCheckIn(
    ctx: TenantContext,
    id: string,
    patch: Partial<FieldCheckInInsert>,
  ): Promise<FieldCheckInRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(fieldCheckInTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(fieldCheckInTable.tenantId, ctx.tenantId),
            eq(fieldCheckInTable.id, id),
            isNull(fieldCheckInTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteCheckIn(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(fieldCheckInTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(fieldCheckInTable.tenantId, ctx.tenantId),
            eq(fieldCheckInTable.id, id),
            isNull(fieldCheckInTable.deletedAt),
          ),
        )
        .returning({ id: fieldCheckInTable.id }),
    );
    return rows.length > 0;
  },

  async restoreCheckIn(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(fieldCheckInTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(fieldCheckInTable.tenantId, ctx.tenantId),
            eq(fieldCheckInTable.id, id),
            isNotNull(fieldCheckInTable.deletedAt),
          ),
        )
        .returning({ id: fieldCheckInTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteCheckIn(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(fieldCheckInTable)
        .where(and(eq(fieldCheckInTable.tenantId, ctx.tenantId), eq(fieldCheckInTable.id, id)))
        .returning({ id: fieldCheckInTable.id }),
    );
    return rows.length > 0;
  },

  /** Cascade helper: flip deleted_at on every check-in of a visit. */
  async setCheckInsDeletedByVisit(
    ctx: TenantContext,
    visitId: string,
    deleted: boolean,
  ): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .update(fieldCheckInTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(fieldCheckInTable.tenantId, ctx.tenantId),
            eq(fieldCheckInTable.visitId, visitId),
            deleted ? isNull(fieldCheckInTable.deletedAt) : isNotNull(fieldCheckInTable.deletedAt),
          ),
        ),
    );
  },

  async hardDeleteCheckInsByVisit(ctx: TenantContext, visitId: string): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .delete(fieldCheckInTable)
        .where(
          and(eq(fieldCheckInTable.tenantId, ctx.tenantId), eq(fieldCheckInTable.visitId, visitId)),
        ),
    );
  },
};
