import { and, asc, desc, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  industryTable,
  occupationTable,
  type IndustryRow,
  type IndustryInsert,
  type OccupationRow,
  type OccupationInsert,
  type TaxonomyKind,
} from "./schema";

/**
 * taxonomy domain repo — the ONLY place that touches `industry` / `occupation`.
 *
 * NAMESPACE MODEL: every row is either GLOBAL (tenant_id NULL = canonical base,
 * shared by all tenants) or PRIVATE (tenant_id = a tenant, that tenant's own
 * rows). So reads return the UNION (`tenant_id IS NULL OR tenant_id = ctx`) and
 * writes/deletes are scoped to the caller's tenant ONLY — a tenant can never
 * mutate the global base through this repo (the seed script owns that, via a
 * direct client). All access is wrapped in `withTenant` (RLS context).
 *
 * Soft-delete contract: list/get filter `deleted_at IS NULL`; `*Trashed` flips
 * to ONLY the tenant's soft-deleted rows; `softDelete` sets `deleted_at`;
 * `restore` clears it; `hardDelete` is a real SQL DELETE (purge). `upsertBySlug`
 * is the concurrency-safe insert (INSERT … ON CONFLICT DO NOTHING → re-select)
 * that backs the AI's "propose new" path. `merge` re-points referencing rows
 * then soft-deletes the merged-away row.
 *
 * The two tables are structurally near-identical; rather than duplicate every
 * method, the parameterized helpers below run against whichever `kind` the
 * caller passes, and the public surface is two thin facades (`industry` /
 * `occupation`) plus a `for(kind)` selector the service uses.
 */

// ── slug normalizer ──────────────────────────────────────────────────────────
/**
 * Normalize a display name into a stable dedup key: lowercase, strip diacritics
 * + punctuation, collapse runs of whitespace/separators to a single "-", trim
 * leading/trailing "-". e.g. "  Real Estate & Property! " → "real-estate-property".
 * This is the alias/collision key — two names that normalize to the same slug
 * are treated as the SAME taxonomy entry.
 */
export function normalizeSlug(input: string): string {
  return (input ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // any non-alphanumeric run → a single dash
    .replace(/^-+|-+$/g, ""); // trim leading/trailing dashes
}

// ── table selection (industry | occupation share the same shape) ─────────────
// `any` on the table dodges drizzle's union-of-tables TS friction (same trick as
// lib/db/soft-delete.ts). Each kind keeps its own row/insert types at the facade.
interface TaxoTable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  idPrefix: string;
}

// Both tables share the same column surface; this is the loose row shape the
// generic engine works with (the typed facades cast to IndustryRow/OccupationRow).
type Row = Record<string, unknown> & {
  id: string;
  tenantId: string | null;
  slug: string;
  deletedAt: Date | null;
};

const TABLES: Record<TaxonomyKind, TaxoTable> = {
  industry: { table: industryTable, idPrefix: "ind_" },
  occupation: { table: occupationTable, idPrefix: "occ_" },
};

/** Predicate: the row belongs to the GLOBAL base OR the caller's tenant. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inNamespace(ctx: TenantContext, t: any): SQL {
  return or(isNull(t.tenantId), eq(t.tenantId, ctx.tenantId)) as SQL;
}

// ── generic engine (parameterized by kind) ───────────────────────────────────
const engine = {
  /** Global base ∪ the caller's tenant rows, live only, name-sorted. */
  async list(ctx: TenantContext, kind: TaxonomyKind): Promise<Record<string, unknown>[]> {
    const { table } = TABLES[kind];
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(table)
        .where(and(inNamespace(ctx, table), isNull(table.deletedAt)))
        .orderBy(asc(table.name)),
    );
  },

  /** ONLY the caller's tenant's soft-deleted rows (global base is never trashed here). */
  async listTrashed(ctx: TenantContext, kind: TaxonomyKind): Promise<Record<string, unknown>[]> {
    const { table } = TABLES[kind];
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(table)
        .where(and(eq(table.tenantId, ctx.tenantId), isNotNull(table.deletedAt)))
        .orderBy(desc(table.deletedAt)),
    );
  },

  /** One live row by id, visible in the caller's namespace (global ∪ tenant). */
  async getById(
    ctx: TenantContext,
    kind: TaxonomyKind,
    id: string,
  ): Promise<Record<string, unknown> | undefined> {
    const { table } = TABLES[kind];
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(table)
        .where(and(eq(table.id, id), inNamespace(ctx, table), isNull(table.deletedAt)))
        .limit(1),
    );
    return row;
  },

  /** One live row by normalized slug, visible in the caller's namespace. The
   *  tenant's own row WINS over a global row with the same slug (private override). */
  async getBySlug(
    ctx: TenantContext,
    kind: TaxonomyKind,
    slug: string,
  ): Promise<Record<string, unknown> | undefined> {
    const { table } = TABLES[kind];
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(table)
        .where(and(eq(table.slug, slug), inNamespace(ctx, table), isNull(table.deletedAt)))
        // tenant rows first (NULL tenant_id sorts last) so private overrides win.
        .orderBy(desc(table.tenantId)),
    );
    return rows[0];
  },

  /**
   * HARD dedup guarantee under concurrency. INSERT … ON CONFLICT (tenant_id,
   * slug) DO NOTHING; if a concurrent writer already inserted the row, RETURNING
   * is empty, so re-select the existing live row in the namespace. Always writes
   * to the CALLER'S tenant namespace (never global). Returns the resolved row +
   * `created` (true only when THIS call inserted it). If a soft-deleted twin
   * exists, it's revived (deleted_at cleared) instead of inserting a duplicate.
   */
  async upsertBySlug(
    ctx: TenantContext,
    kind: TaxonomyKind,
    values: Record<string, unknown> & { slug: string },
  ): Promise<{ row: Record<string, unknown>; created: boolean }> {
    const { table, idPrefix } = TABLES[kind];
    const id = idPrefix + crypto.randomUUID();
    const inserted = (await withTenant(ctx, (tx) =>
      tx
        .insert(table)
        .values({ ...values, id, tenantId: ctx.tenantId })
        .onConflictDoNothing({ target: [table.tenantId, table.slug] })
        .returning(),
    )) as Row[];
    if (inserted[0]) return { row: inserted[0], created: true };

    // Conflict (or a concurrent insert) — the row already exists in THIS tenant
    // namespace. Re-select it; if it was soft-deleted, revive it in place.
    const existingRows = (await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(table)
        .where(and(eq(table.tenantId, ctx.tenantId), eq(table.slug, values.slug)))
        .limit(1),
    )) as Row[];
    const existing = existingRows[0];
    if (existing && existing.deletedAt) {
      const revivedRows = (await withTenant(ctx, (tx) =>
        tx
          .update(table)
          .set({ deletedAt: null, updatedAt: new Date() })
          .where(and(eq(table.tenantId, ctx.tenantId), eq(table.id, existing.id)))
          .returning(),
      )) as Row[];
      return { row: revivedRows[0] ?? existing, created: false };
    }
    return { row: existing, created: false };
  },

  /** Insert a fresh tenant row (no conflict handling — caller resolved the slug). */
  async insert(
    ctx: TenantContext,
    kind: TaxonomyKind,
    values: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { table, idPrefix } = TABLES[kind];
    const rows = (await withTenant(ctx, (tx) =>
      tx
        .insert(table)
        .values({ ...values, id: idPrefix + crypto.randomUUID(), tenantId: ctx.tenantId })
        .returning(),
    )) as Row[];
    return rows[0];
  },

  /** Update a row the caller OWNS (tenant rows only — global base is read-only here). */
  async update(
    ctx: TenantContext,
    kind: TaxonomyKind,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined> {
    const { table } = TABLES[kind];
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(table)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(table.tenantId, ctx.tenantId), eq(table.id, id), isNull(table.deletedAt)))
        .returning(),
    );
    return row;
  },

  async softDelete(ctx: TenantContext, kind: TaxonomyKind, id: string): Promise<boolean> {
    const { table } = TABLES[kind];
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(table)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(table.tenantId, ctx.tenantId), eq(table.id, id), isNull(table.deletedAt)))
        .returning({ id: table.id }),
    );
    return rows.length > 0;
  },

  async restore(ctx: TenantContext, kind: TaxonomyKind, id: string): Promise<boolean> {
    const { table } = TABLES[kind];
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(table)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(and(eq(table.tenantId, ctx.tenantId), eq(table.id, id), isNotNull(table.deletedAt)))
        .returning({ id: table.id }),
    );
    return rows.length > 0;
  },

  async hardDelete(ctx: TenantContext, kind: TaxonomyKind, id: string): Promise<boolean> {
    const { table } = TABLES[kind];
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(table)
        .where(and(eq(table.tenantId, ctx.tenantId), eq(table.id, id)))
        .returning({ id: table.id }),
    );
    return rows.length > 0;
  },

  /**
   * MERGE `fromId` INTO `toId`: re-point every row in the caller's namespace that
   * references `fromId` (a child's `parent_id`, or — for occupation — its
   * `industry_id`) over to `toId`, then SOFT-DELETE the merged-away `fromId` row.
   * Both ids must be live in the caller's namespace; only the caller's OWN rows
   * are re-pointed/deleted (the global base is never mutated here). Returns the
   * surviving `toId` row.
   */
  async merge(
    ctx: TenantContext,
    kind: TaxonomyKind,
    fromId: string,
    toId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const { table } = TABLES[kind];
    await withTenant(ctx, async (tx) => {
      // Re-point children's parent_id (tenant-owned rows only).
      await tx
        .update(table)
        .set({ parentId: toId, updatedAt: new Date() })
        .where(and(eq(table.tenantId, ctx.tenantId), eq(table.parentId, fromId)));
      // For occupation, re-point industry_id references too.
      if (kind === "occupation") {
        await tx
          .update(occupationTable)
          .set({ industryId: toId, updatedAt: new Date() })
          .where(
            and(eq(occupationTable.tenantId, ctx.tenantId), eq(occupationTable.industryId, fromId)),
          );
      }
      // Soft-delete the merged-away row.
      await tx
        .update(table)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(table.tenantId, ctx.tenantId), eq(table.id, fromId)));
    });
    return this.getById(ctx, kind, toId);
  },
};

/**
 * When an occupation is merged away, any occupation in the namespace that pinned
 * its `industry_id` to the deleted INDUSTRY would dangle. We re-point industry
 * references from a merged INDUSTRY too (occupation.industry_id → toId).
 */
async function mergeIndustry(
  ctx: TenantContext,
  fromId: string,
  toId: string,
): Promise<IndustryRow | undefined> {
  await withTenant(ctx, async (tx) => {
    await tx
      .update(industryTable)
      .set({ parentId: toId, updatedAt: new Date() })
      .where(and(eq(industryTable.tenantId, ctx.tenantId), eq(industryTable.parentId, fromId)));
    // Occupations in this tenant that pointed at the merged industry follow it.
    await tx
      .update(occupationTable)
      .set({ industryId: toId, updatedAt: new Date() })
      .where(and(eq(occupationTable.tenantId, ctx.tenantId), eq(occupationTable.industryId, fromId)));
    await tx
      .update(industryTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(industryTable.tenantId, ctx.tenantId), eq(industryTable.id, fromId)));
  });
  return engine.getById(ctx, "industry", toId) as Promise<IndustryRow | undefined>;
}

// ── typed facades (industry / occupation) ────────────────────────────────────
export const taxonomyRepo = {
  normalizeSlug,

  industry: {
    list: (ctx: TenantContext) => engine.list(ctx, "industry") as Promise<IndustryRow[]>,
    listTrashed: (ctx: TenantContext) =>
      engine.listTrashed(ctx, "industry") as Promise<IndustryRow[]>,
    getById: (ctx: TenantContext, id: string) =>
      engine.getById(ctx, "industry", id) as Promise<IndustryRow | undefined>,
    getBySlug: (ctx: TenantContext, slug: string) =>
      engine.getBySlug(ctx, "industry", slug) as Promise<IndustryRow | undefined>,
    upsertBySlug: (ctx: TenantContext, values: Omit<IndustryInsert, "id" | "tenantId">) =>
      engine.upsertBySlug(ctx, "industry", values as Record<string, unknown> & { slug: string }) as Promise<{
        row: IndustryRow;
        created: boolean;
      }>,
    insert: (ctx: TenantContext, values: Omit<IndustryInsert, "id" | "tenantId">) =>
      engine.insert(ctx, "industry", values as Record<string, unknown>) as Promise<IndustryRow>,
    update: (ctx: TenantContext, id: string, patch: Partial<IndustryInsert>) =>
      engine.update(ctx, "industry", id, patch as Record<string, unknown>) as Promise<
        IndustryRow | undefined
      >,
    softDelete: (ctx: TenantContext, id: string) => engine.softDelete(ctx, "industry", id),
    restore: (ctx: TenantContext, id: string) => engine.restore(ctx, "industry", id),
    hardDelete: (ctx: TenantContext, id: string) => engine.hardDelete(ctx, "industry", id),
    merge: (ctx: TenantContext, fromId: string, toId: string) => mergeIndustry(ctx, fromId, toId),
  },

  occupation: {
    list: (ctx: TenantContext) => engine.list(ctx, "occupation") as Promise<OccupationRow[]>,
    listTrashed: (ctx: TenantContext) =>
      engine.listTrashed(ctx, "occupation") as Promise<OccupationRow[]>,
    getById: (ctx: TenantContext, id: string) =>
      engine.getById(ctx, "occupation", id) as Promise<OccupationRow | undefined>,
    getBySlug: (ctx: TenantContext, slug: string) =>
      engine.getBySlug(ctx, "occupation", slug) as Promise<OccupationRow | undefined>,
    upsertBySlug: (ctx: TenantContext, values: Omit<OccupationInsert, "id" | "tenantId">) =>
      engine.upsertBySlug(
        ctx,
        "occupation",
        values as Record<string, unknown> & { slug: string },
      ) as Promise<{ row: OccupationRow; created: boolean }>,
    insert: (ctx: TenantContext, values: Omit<OccupationInsert, "id" | "tenantId">) =>
      engine.insert(ctx, "occupation", values as Record<string, unknown>) as Promise<OccupationRow>,
    update: (ctx: TenantContext, id: string, patch: Partial<OccupationInsert>) =>
      engine.update(ctx, "occupation", id, patch as Record<string, unknown>) as Promise<
        OccupationRow | undefined
      >,
    softDelete: (ctx: TenantContext, id: string) => engine.softDelete(ctx, "occupation", id),
    restore: (ctx: TenantContext, id: string) => engine.restore(ctx, "occupation", id),
    hardDelete: (ctx: TenantContext, id: string) => engine.hardDelete(ctx, "occupation", id),
    merge: (ctx: TenantContext, fromId: string, toId: string) =>
      engine.merge(ctx, "occupation", fromId, toId) as Promise<OccupationRow | undefined>,
  },

  /** Pick the right facade for a `kind` (used by the service's generic paths). */
  for(kind: TaxonomyKind) {
    return kind === "industry" ? this.industry : this.occupation;
  },
};

// Re-export so callers don't reach into drizzle for the raw helper.
export { sql };
