import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  contentTemplateTable,
  contentPlanTable,
  type ContentTemplateRow,
  type ContentTemplateInsert,
  type ContentPlanRow,
  type ContentPlanInsert,
} from "./schema";

/**
 * content repo — the ONLY place that touches the two content tables
 * (`content_template`, `content_plan`). Both are TENANT-scoped, so every
 * read/write is wrapped in `withTenant` and filtered by `tenant_id`.
 *
 * Each entity exposes the standard list/get/insert/update + soft-delete contract:
 *   - list / get reads filter `deleted_at IS NULL`;
 *   - `listTrashed*` flips to `deleted_at IS NOT NULL` (restore candidates);
 *   - `softDelete*` sets `deleted_at=now()` (only matches live rows);
 *   - `restore*` clears it (only matches trashed rows);
 *   - `hardDelete*` permanently removes the row.
 * No FKs — cross-entity integrity lives in the service layer.
 */
export const contentRepo = {
  // ═══════════════════════ content_template ═════════════════════════
  async listTemplates(
    ctx: TenantContext,
    filter?: { workspaceId?: string; channel?: string; category?: string; status?: string },
  ): Promise<ContentTemplateRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(contentTemplateTable)
        .where(
          and(
            eq(contentTemplateTable.tenantId, ctx.tenantId),
            isNull(contentTemplateTable.deletedAt),
            filter?.workspaceId
              ? eq(contentTemplateTable.workspaceId, filter.workspaceId)
              : undefined,
            filter?.channel ? eq(contentTemplateTable.channel, filter.channel) : undefined,
            filter?.category ? eq(contentTemplateTable.category, filter.category) : undefined,
            filter?.status ? eq(contentTemplateTable.status, filter.status) : undefined,
          ),
        )
        .orderBy(desc(contentTemplateTable.updatedAt)),
    );
  },

  async listTrashedTemplates(ctx: TenantContext): Promise<ContentTemplateRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(contentTemplateTable)
        .where(
          and(
            eq(contentTemplateTable.tenantId, ctx.tenantId),
            isNotNull(contentTemplateTable.deletedAt),
          ),
        )
        .orderBy(desc(contentTemplateTable.deletedAt)),
    );
  },

  async getTemplate(ctx: TenantContext, id: string): Promise<ContentTemplateRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(contentTemplateTable)
        .where(
          and(
            eq(contentTemplateTable.tenantId, ctx.tenantId),
            eq(contentTemplateTable.id, id),
            isNull(contentTemplateTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertTemplate(
    ctx: TenantContext,
    values: ContentTemplateInsert,
  ): Promise<ContentTemplateRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(contentTemplateTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateTemplate(
    ctx: TenantContext,
    id: string,
    patch: Partial<ContentTemplateInsert>,
  ): Promise<ContentTemplateRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(contentTemplateTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(contentTemplateTable.tenantId, ctx.tenantId),
            eq(contentTemplateTable.id, id),
            isNull(contentTemplateTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteTemplate(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(contentTemplateTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(contentTemplateTable.tenantId, ctx.tenantId),
            eq(contentTemplateTable.id, id),
            isNull(contentTemplateTable.deletedAt),
          ),
        )
        .returning({ id: contentTemplateTable.id }),
    );
    return rows.length > 0;
  },

  async restoreTemplate(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(contentTemplateTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(contentTemplateTable.tenantId, ctx.tenantId),
            eq(contentTemplateTable.id, id),
            isNotNull(contentTemplateTable.deletedAt),
          ),
        )
        .returning({ id: contentTemplateTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteTemplate(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(contentTemplateTable)
        .where(
          and(eq(contentTemplateTable.tenantId, ctx.tenantId), eq(contentTemplateTable.id, id)),
        )
        .returning({ id: contentTemplateTable.id }),
    );
    return rows.length > 0;
  },

  /** Cascade helper: flip deleted_at on every plan item that sourced a template. */
  async setPlansDeletedByTemplate(
    ctx: TenantContext,
    templateId: string,
    deleted: boolean,
  ): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .update(contentPlanTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(contentPlanTable.tenantId, ctx.tenantId),
            eq(contentPlanTable.templateId, templateId),
            deleted ? isNull(contentPlanTable.deletedAt) : isNotNull(contentPlanTable.deletedAt),
          ),
        ),
    );
  },

  // ═══════════════════════ content_plan ═════════════════════════════
  async listPlans(
    ctx: TenantContext,
    filter?: { workspaceId?: string; templateId?: string; channel?: string; status?: string },
  ): Promise<ContentPlanRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(contentPlanTable)
        .where(
          and(
            eq(contentPlanTable.tenantId, ctx.tenantId),
            isNull(contentPlanTable.deletedAt),
            filter?.workspaceId ? eq(contentPlanTable.workspaceId, filter.workspaceId) : undefined,
            filter?.templateId ? eq(contentPlanTable.templateId, filter.templateId) : undefined,
            filter?.channel ? eq(contentPlanTable.channel, filter.channel) : undefined,
            filter?.status ? eq(contentPlanTable.status, filter.status) : undefined,
          ),
        )
        .orderBy(desc(contentPlanTable.updatedAt)),
    );
  },

  async listTrashedPlans(ctx: TenantContext): Promise<ContentPlanRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(contentPlanTable)
        .where(
          and(eq(contentPlanTable.tenantId, ctx.tenantId), isNotNull(contentPlanTable.deletedAt)),
        )
        .orderBy(desc(contentPlanTable.deletedAt)),
    );
  },

  async getPlan(ctx: TenantContext, id: string): Promise<ContentPlanRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(contentPlanTable)
        .where(
          and(
            eq(contentPlanTable.tenantId, ctx.tenantId),
            eq(contentPlanTable.id, id),
            isNull(contentPlanTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertPlan(ctx: TenantContext, values: ContentPlanInsert): Promise<ContentPlanRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(contentPlanTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updatePlan(
    ctx: TenantContext,
    id: string,
    patch: Partial<ContentPlanInsert>,
  ): Promise<ContentPlanRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(contentPlanTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(contentPlanTable.tenantId, ctx.tenantId),
            eq(contentPlanTable.id, id),
            isNull(contentPlanTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeletePlan(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(contentPlanTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(contentPlanTable.tenantId, ctx.tenantId),
            eq(contentPlanTable.id, id),
            isNull(contentPlanTable.deletedAt),
          ),
        )
        .returning({ id: contentPlanTable.id }),
    );
    return rows.length > 0;
  },

  async restorePlan(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(contentPlanTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(contentPlanTable.tenantId, ctx.tenantId),
            eq(contentPlanTable.id, id),
            isNotNull(contentPlanTable.deletedAt),
          ),
        )
        .returning({ id: contentPlanTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeletePlan(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(contentPlanTable)
        .where(and(eq(contentPlanTable.tenantId, ctx.tenantId), eq(contentPlanTable.id, id)))
        .returning({ id: contentPlanTable.id }),
    );
    return rows.length > 0;
  },
};
