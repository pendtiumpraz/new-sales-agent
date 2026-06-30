import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  conversationStageTable,
  closingReadinessTable,
  kbTechniqueTable,
  type ConversationStageRow,
  type ConversationStageInsert,
  type ClosingReadinessRow,
  type ClosingReadinessInsert,
  type KbTechniqueRow,
  type KbTechniqueInsert,
} from "./schema";

/**
 * sales / closing-flow repo — the ONLY place that touches `conversation_stage`,
 * `closing_readiness`, and `kb_technique`. All three are TENANT-scoped, so every
 * read/write is wrapped in `withTenant` and filtered by `tenant_id`.
 *
 * `conversation_stage` + `closing_readiness` are 1:1 satellites of a conversation
 * — the repo exposes get-by-conversation + upsert (on the unique
 * (tenant,conversation) index) + soft/restore/hardDelete. `kb_technique` is a
 * per-tenant catalog with the standard list/get/insert/update + soft-delete
 * contract, plus a `seed` helper that idempotently upserts on (tenant,key).
 * List/get reads filter `deleted_at IS NULL`; `*Trashed` flips to soft-deleted
 * rows only.
 */
export const salesRepo = {
  // ═══════════════════════ conversation_stage ═══════════════════════
  async getStage(
    ctx: TenantContext,
    conversationId: string,
  ): Promise<ConversationStageRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(conversationStageTable)
        .where(
          and(
            eq(conversationStageTable.tenantId, ctx.tenantId),
            eq(conversationStageTable.conversationId, conversationId),
            isNull(conversationStageTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async getStageById(ctx: TenantContext, id: string): Promise<ConversationStageRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(conversationStageTable)
        .where(
          and(
            eq(conversationStageTable.tenantId, ctx.tenantId),
            eq(conversationStageTable.id, id),
            isNull(conversationStageTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async listStages(ctx: TenantContext): Promise<ConversationStageRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(conversationStageTable)
        .where(
          and(
            eq(conversationStageTable.tenantId, ctx.tenantId),
            isNull(conversationStageTable.deletedAt),
          ),
        )
        .orderBy(desc(conversationStageTable.updatedAt)),
    );
  },

  async listTrashedStages(ctx: TenantContext): Promise<ConversationStageRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(conversationStageTable)
        .where(
          and(
            eq(conversationStageTable.tenantId, ctx.tenantId),
            isNotNull(conversationStageTable.deletedAt),
          ),
        )
        .orderBy(desc(conversationStageTable.deletedAt)),
    );
  },

  /** Upsert the conversation's single stage row (1:1 on (tenant,conversation)). */
  async upsertStage(
    ctx: TenantContext,
    conversationId: string,
    values: Omit<ConversationStageInsert, "id" | "tenantId" | "conversationId">,
  ): Promise<ConversationStageRow> {
    const id = "cst_" + crypto.randomUUID();
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(conversationStageTable)
        .values({ ...values, id, tenantId: ctx.tenantId, conversationId })
        .onConflictDoUpdate({
          target: [conversationStageTable.tenantId, conversationStageTable.conversationId],
          set: { ...values, deletedAt: null, updatedAt: new Date() },
        })
        .returning(),
    );
    return row;
  },

  async softDeleteStage(ctx: TenantContext, conversationId: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(conversationStageTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(conversationStageTable.tenantId, ctx.tenantId),
            eq(conversationStageTable.conversationId, conversationId),
            isNull(conversationStageTable.deletedAt),
          ),
        )
        .returning({ id: conversationStageTable.id }),
    );
    return rows.length > 0;
  },

  async restoreStage(ctx: TenantContext, conversationId: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(conversationStageTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(conversationStageTable.tenantId, ctx.tenantId),
            eq(conversationStageTable.conversationId, conversationId),
            isNotNull(conversationStageTable.deletedAt),
          ),
        )
        .returning({ id: conversationStageTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteStage(ctx: TenantContext, conversationId: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(conversationStageTable)
        .where(
          and(
            eq(conversationStageTable.tenantId, ctx.tenantId),
            eq(conversationStageTable.conversationId, conversationId),
          ),
        )
        .returning({ id: conversationStageTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ closing_readiness ════════════════════════
  async getReadiness(
    ctx: TenantContext,
    conversationId: string,
  ): Promise<ClosingReadinessRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(closingReadinessTable)
        .where(
          and(
            eq(closingReadinessTable.tenantId, ctx.tenantId),
            eq(closingReadinessTable.conversationId, conversationId),
            isNull(closingReadinessTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** List live readiness rows, optionally filtered by band. Hottest first. */
  async listReadiness(
    ctx: TenantContext,
    filter?: { band?: string },
  ): Promise<ClosingReadinessRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(closingReadinessTable)
        .where(
          and(
            eq(closingReadinessTable.tenantId, ctx.tenantId),
            isNull(closingReadinessTable.deletedAt),
            filter?.band ? eq(closingReadinessTable.band, filter.band) : undefined,
          ),
        )
        .orderBy(desc(closingReadinessTable.score), desc(closingReadinessTable.updatedAt)),
    );
  },

  async listTrashedReadiness(ctx: TenantContext): Promise<ClosingReadinessRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(closingReadinessTable)
        .where(
          and(
            eq(closingReadinessTable.tenantId, ctx.tenantId),
            isNotNull(closingReadinessTable.deletedAt),
          ),
        )
        .orderBy(desc(closingReadinessTable.deletedAt)),
    );
  },

  /** Upsert the conversation's single readiness row (1:1 on (tenant,conversation)). */
  async upsertReadiness(
    ctx: TenantContext,
    conversationId: string,
    values: Omit<ClosingReadinessInsert, "id" | "tenantId" | "conversationId">,
  ): Promise<ClosingReadinessRow> {
    const id = "crd_" + crypto.randomUUID();
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(closingReadinessTable)
        .values({ ...values, id, tenantId: ctx.tenantId, conversationId })
        .onConflictDoUpdate({
          target: [closingReadinessTable.tenantId, closingReadinessTable.conversationId],
          set: { ...values, deletedAt: null, updatedAt: new Date() },
        })
        .returning(),
    );
    return row;
  },

  async softDeleteReadiness(ctx: TenantContext, conversationId: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(closingReadinessTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(closingReadinessTable.tenantId, ctx.tenantId),
            eq(closingReadinessTable.conversationId, conversationId),
            isNull(closingReadinessTable.deletedAt),
          ),
        )
        .returning({ id: closingReadinessTable.id }),
    );
    return rows.length > 0;
  },

  async restoreReadiness(ctx: TenantContext, conversationId: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(closingReadinessTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(closingReadinessTable.tenantId, ctx.tenantId),
            eq(closingReadinessTable.conversationId, conversationId),
            isNotNull(closingReadinessTable.deletedAt),
          ),
        )
        .returning({ id: closingReadinessTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteReadiness(ctx: TenantContext, conversationId: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(closingReadinessTable)
        .where(
          and(
            eq(closingReadinessTable.tenantId, ctx.tenantId),
            eq(closingReadinessTable.conversationId, conversationId),
          ),
        )
        .returning({ id: closingReadinessTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ kb_technique ═════════════════════════════
  async listTechniques(ctx: TenantContext): Promise<KbTechniqueRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(kbTechniqueTable)
        .where(
          and(eq(kbTechniqueTable.tenantId, ctx.tenantId), isNull(kbTechniqueTable.deletedAt)),
        )
        .orderBy(asc(kbTechniqueTable.sort), asc(kbTechniqueTable.name)),
    );
  },

  async listTrashedTechniques(ctx: TenantContext): Promise<KbTechniqueRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(kbTechniqueTable)
        .where(
          and(eq(kbTechniqueTable.tenantId, ctx.tenantId), isNotNull(kbTechniqueTable.deletedAt)),
        )
        .orderBy(desc(kbTechniqueTable.deletedAt)),
    );
  },

  async getTechnique(ctx: TenantContext, id: string): Promise<KbTechniqueRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(kbTechniqueTable)
        .where(
          and(
            eq(kbTechniqueTable.tenantId, ctx.tenantId),
            eq(kbTechniqueTable.id, id),
            isNull(kbTechniqueTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async getTechniqueByKey(ctx: TenantContext, key: string): Promise<KbTechniqueRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(kbTechniqueTable)
        .where(
          and(
            eq(kbTechniqueTable.tenantId, ctx.tenantId),
            eq(kbTechniqueTable.key, key),
            isNull(kbTechniqueTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Count LIVE techniques — drives "already seeded?" check. */
  async countTechniques(ctx: TenantContext): Promise<number> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select({ id: kbTechniqueTable.id })
        .from(kbTechniqueTable)
        .where(
          and(eq(kbTechniqueTable.tenantId, ctx.tenantId), isNull(kbTechniqueTable.deletedAt)),
        ),
    );
    return rows.length;
  },

  async insertTechnique(ctx: TenantContext, values: KbTechniqueInsert): Promise<KbTechniqueRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(kbTechniqueTable)
        .values({ ...values, tenantId: ctx.tenantId })
        .returning(),
    );
    return row;
  },

  async updateTechnique(
    ctx: TenantContext,
    id: string,
    patch: Partial<KbTechniqueInsert>,
  ): Promise<KbTechniqueRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(kbTechniqueTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(kbTechniqueTable.tenantId, ctx.tenantId),
            eq(kbTechniqueTable.id, id),
            isNull(kbTechniqueTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  /**
   * Batch-seed techniques in ONE upsert (audit #33 — replaces 17 sequential
   * `upsertTechniqueByKey` round-trips). Idempotent on (tenant,key): re-seeding
   * refreshes copy + un-trashes without duplicating. Empty input is a no-op.
   */
  async seedTechniques(
    ctx: TenantContext,
    items: Omit<KbTechniqueInsert, "id" | "tenantId">[],
  ): Promise<KbTechniqueRow[]> {
    if (items.length === 0) return [];
    return withTenant(ctx, (tx) =>
      tx
        .insert(kbTechniqueTable)
        .values(
          items.map((v) => ({
            ...v,
            id: "tek_" + crypto.randomUUID(),
            tenantId: ctx.tenantId,
          })),
        )
        .onConflictDoUpdate({
          target: [kbTechniqueTable.tenantId, kbTechniqueTable.key],
          set: {
            name: sql`excluded.name`,
            inti: sql`excluded.inti`,
            contoh: sql`excluded.contoh`,
            cocokUntuk: sql`excluded.cocok_untuk`,
            sinyal: sql`excluded.sinyal`,
            sort: sql`excluded.sort`,
            deletedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning(),
    );
  },

  /** Idempotently upsert a technique on (tenant,key) — used by the seeder. */
  async upsertTechniqueByKey(
    ctx: TenantContext,
    values: Omit<KbTechniqueInsert, "id" | "tenantId">,
  ): Promise<KbTechniqueRow> {
    const id = "tek_" + crypto.randomUUID();
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .insert(kbTechniqueTable)
        .values({ ...values, id, tenantId: ctx.tenantId })
        .onConflictDoUpdate({
          target: [kbTechniqueTable.tenantId, kbTechniqueTable.key],
          set: {
            name: values.name,
            inti: values.inti,
            contoh: values.contoh ?? null,
            cocokUntuk: values.cocokUntuk ?? [],
            sinyal: values.sinyal ?? [],
            sort: values.sort ?? 0,
            deletedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning(),
    );
    return row;
  },

  async softDeleteTechnique(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(kbTechniqueTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(kbTechniqueTable.tenantId, ctx.tenantId),
            eq(kbTechniqueTable.id, id),
            isNull(kbTechniqueTable.deletedAt),
          ),
        )
        .returning({ id: kbTechniqueTable.id }),
    );
    return rows.length > 0;
  },

  async restoreTechnique(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(kbTechniqueTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(kbTechniqueTable.tenantId, ctx.tenantId),
            eq(kbTechniqueTable.id, id),
            isNotNull(kbTechniqueTable.deletedAt),
          ),
        )
        .returning({ id: kbTechniqueTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteTechnique(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(kbTechniqueTable)
        .where(and(eq(kbTechniqueTable.tenantId, ctx.tenantId), eq(kbTechniqueTable.id, id)))
        .returning({ id: kbTechniqueTable.id }),
    );
    return rows.length > 0;
  },
};
