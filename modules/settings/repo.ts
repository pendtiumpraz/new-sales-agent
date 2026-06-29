import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  knowledgeBaseTable,
  tenantSettingsTable,
  type KnowledgeBaseRow,
  type KnowledgeBaseInsert,
  type TenantSettingsRow,
  type TenantSettingsInsert,
} from "./schema";

/**
 * settings domain repo — the ONLY place that touches `knowledge_base` and
 * `tenant_settings`. Both are TENANT-scoped, so every read/write is wrapped in
 * `withTenant` and filtered by `tenant_id`.
 *
 * `knowledge_base` gets the full list/get/insert/update + soft-delete contract
 * (softDelete/restore/hardDelete + listTrashed) so the service can expose
 * trash/restore/purge. `tenant_settings` is a per-tenant k/v store: list/get +
 * an idempotent `upsert` on (tenant,key), plus soft-delete for completeness.
 * List/get reads filter `deleted_at IS NULL`; `*Trashed` flips to soft-deleted
 * rows only.
 *
 * NOTE: this repo does NOT touch the AI / mail / billing tables — those belong to
 * their existing owners (`lib/ai/registry`, `lib/mail/*`, `lib/billing/*`). The
 * settings SERVICE composes them; the repo only owns the two new tables.
 */
export const settingsRepo = {
  // ═══════════════════════ knowledge_base ═══════════════════════════
  async listKb(ctx: TenantContext, filter?: { scope?: string }): Promise<KnowledgeBaseRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(knowledgeBaseTable)
        .where(
          and(
            eq(knowledgeBaseTable.tenantId, ctx.tenantId),
            isNull(knowledgeBaseTable.deletedAt),
            filter?.scope ? eq(knowledgeBaseTable.scope, filter.scope) : undefined,
          ),
        )
        .orderBy(
          desc(knowledgeBaseTable.pinned),
          asc(knowledgeBaseTable.sort),
          desc(knowledgeBaseTable.updatedAt),
        ),
    );
  },

  async listTrashedKb(ctx: TenantContext): Promise<KnowledgeBaseRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(knowledgeBaseTable)
        .where(
          and(
            eq(knowledgeBaseTable.tenantId, ctx.tenantId),
            isNotNull(knowledgeBaseTable.deletedAt),
          ),
        )
        .orderBy(desc(knowledgeBaseTable.deletedAt)),
    );
  },

  async getKb(ctx: TenantContext, id: string): Promise<KnowledgeBaseRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(knowledgeBaseTable)
        .where(
          and(
            eq(knowledgeBaseTable.tenantId, ctx.tenantId),
            eq(knowledgeBaseTable.id, id),
            isNull(knowledgeBaseTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertKb(ctx: TenantContext, values: KnowledgeBaseInsert): Promise<KnowledgeBaseRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(knowledgeBaseTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateKb(
    ctx: TenantContext,
    id: string,
    patch: Partial<KnowledgeBaseInsert>,
  ): Promise<KnowledgeBaseRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(knowledgeBaseTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(knowledgeBaseTable.tenantId, ctx.tenantId),
            eq(knowledgeBaseTable.id, id),
            isNull(knowledgeBaseTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteKb(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(knowledgeBaseTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(knowledgeBaseTable.tenantId, ctx.tenantId),
            eq(knowledgeBaseTable.id, id),
            isNull(knowledgeBaseTable.deletedAt),
          ),
        )
        .returning({ id: knowledgeBaseTable.id }),
    );
    return rows.length > 0;
  },

  async restoreKb(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(knowledgeBaseTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(knowledgeBaseTable.tenantId, ctx.tenantId),
            eq(knowledgeBaseTable.id, id),
            isNotNull(knowledgeBaseTable.deletedAt),
          ),
        )
        .returning({ id: knowledgeBaseTable.id }),
    );
    return rows.length > 0;
  },

  /**
   * PERMANENT delete — a real SQL `DELETE` (purge from trash). Matches on `id`
   * alone (regardless of `deleted_at`) so a row can be purged whether it was
   * soft-deleted first or not. Returns true if a row was removed.
   */
  async hardDeleteKb(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(knowledgeBaseTable)
        .where(and(eq(knowledgeBaseTable.tenantId, ctx.tenantId), eq(knowledgeBaseTable.id, id)))
        .returning({ id: knowledgeBaseTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ tenant_settings ══════════════════════════
  async listSettings(
    ctx: TenantContext,
    filter?: { category?: string },
  ): Promise<TenantSettingsRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(tenantSettingsTable)
        .where(
          and(
            eq(tenantSettingsTable.tenantId, ctx.tenantId),
            isNull(tenantSettingsTable.deletedAt),
            filter?.category ? eq(tenantSettingsTable.category, filter.category) : undefined,
          ),
        )
        .orderBy(asc(tenantSettingsTable.key)),
    );
  },

  async getSetting(ctx: TenantContext, key: string): Promise<TenantSettingsRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(tenantSettingsTable)
        .where(
          and(
            eq(tenantSettingsTable.tenantId, ctx.tenantId),
            eq(tenantSettingsTable.key, key),
            isNull(tenantSettingsTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Idempotently upsert a setting on (tenant,key). Re-activates a soft-deleted row. */
  async upsertSetting(
    ctx: TenantContext,
    key: string,
    patch: { value?: unknown; category?: string; label?: string | null },
  ): Promise<TenantSettingsRow> {
    const id = "tst_" + crypto.randomUUID();
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(tenantSettingsTable)
        .values({
          id,
          tenantId: ctx.tenantId,
          key,
          value: (patch.value ?? null) as TenantSettingsInsert["value"],
          category: patch.category ?? "misc",
          label: patch.label ?? null,
        })
        .onConflictDoUpdate({
          target: [tenantSettingsTable.tenantId, tenantSettingsTable.key],
          set: {
            ...(patch.value !== undefined
              ? { value: patch.value as TenantSettingsInsert["value"] }
              : {}),
            ...(patch.category !== undefined ? { category: patch.category } : {}),
            ...(patch.label !== undefined ? { label: patch.label } : {}),
            deletedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning(),
    );
    return row;
  },

  async softDeleteSetting(ctx: TenantContext, key: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(tenantSettingsTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(tenantSettingsTable.tenantId, ctx.tenantId),
            eq(tenantSettingsTable.key, key),
            isNull(tenantSettingsTable.deletedAt),
          ),
        )
        .returning({ id: tenantSettingsTable.id }),
    );
    return rows.length > 0;
  },
};
