import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, type AnyColumn } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  DEFAULT_PAGE_LIMIT,
  decodeCursor,
  encodeCursor,
  type Page,
} from "@/modules/_shared/api";
import {
  companyTable,
  contactTable,
  pipelineTable,
  pipelineStageTable,
  dealTable,
  activityTable,
  type CompanyRow,
  type CompanyInsert,
  type ContactRow,
  type ContactInsert,
  type PipelineRow,
  type PipelineInsert,
  type PipelineStageRow,
  type PipelineStageInsert,
  type DealRow,
  type DealInsert,
  type ActivityRow,
  type ActivityInsert,
} from "./schema";

/**
 * crm domain repo — the ONLY place that touches `company_v2`, `contact`,
 * `pipeline`, `pipeline_stage`, `deal`, and `activity`. All six are TENANT-scoped,
 * so every read/write is wrapped in `withTenant` and filtered by `tenant_id`.
 *
 * Each entity exposes the soft-delete contract: list/get filter
 * `deleted_at IS NULL`; `*Trashed` flips to ONLY soft-deleted rows; `softDelete`
 * sets `deleted_at`; `restore` clears it (only matching already-trashed rows);
 * `hardDelete` is a real SQL DELETE (purge). Cross-entity reads the service needs
 * for integrity/cascade (children of a company/contact/deal/pipeline) are exposed
 * as `listChildren`-style helpers + bulk `set*Deleted`.
 *
 * The hot, unbounded lists (`listContacts`, `listDeals`) additionally expose a
 * keyset (`created_at`, `id`) page variant so a big tenant ships only one page
 * over the wire instead of its whole table (perf audit #13).
 */

/** Pagination input shared by the keyset list variants (`created_at DESC` order). */
export interface PageParams {
  limit?: number;
  cursor?: string;
}

/**
 * Keyset predicate for a `created_at DESC, id DESC` ordering: only rows strictly
 * BEFORE the decoded cursor. Tie-break on `id` keeps the order total/stable so a
 * page never skips or repeats a row when two rows share `created_at`.
 */
function keysetBefore(
  table: { createdAt: AnyColumn; id: AnyColumn },
  cursor: string | undefined,
) {
  const c = decodeCursor(cursor);
  if (!c) return undefined;
  const at = new Date(c.createdAt);
  return or(
    lt(table.createdAt, at),
    and(eq(table.createdAt, at), lt(table.id, c.id)),
  );
}

/**
 * Turn a `limit + 1` over-fetch into a `Page`: trim to `limit` and, if a further
 * row existed, emit a cursor pinned to the LAST returned row's `(created_at, id)`.
 */
function toPage<T extends { createdAt: Date; id: string }>(rows: T[], limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null,
  };
}

export const crmRepo = {
  // ═══════════════════════ company_v2 ═══════════════════════════════
  async listCompanies(ctx: TenantContext): Promise<CompanyRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(companyTable)
        .where(and(eq(companyTable.tenantId, ctx.tenantId), isNull(companyTable.deletedAt)))
        .orderBy(desc(companyTable.createdAt)),
    );
  },

  async listTrashedCompanies(ctx: TenantContext): Promise<CompanyRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(companyTable)
        .where(and(eq(companyTable.tenantId, ctx.tenantId), isNotNull(companyTable.deletedAt)))
        .orderBy(desc(companyTable.deletedAt)),
    );
  },

  async getCompany(ctx: TenantContext, id: string): Promise<CompanyRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(companyTable)
        .where(
          and(
            eq(companyTable.tenantId, ctx.tenantId),
            eq(companyTable.id, id),
            isNull(companyTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /**
   * Dedup lookup for channel-agnostic ingest: match a live company by normalized
   * `domain` first (the strong key), else by exact `name`. Used to UPSERT the
   * Company node of an ingested graph instead of creating a duplicate each crawl.
   */
  async findCompanyByDomainOrName(
    ctx: TenantContext,
    domain: string | null,
    name: string,
  ): Promise<CompanyRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(companyTable)
        .where(
          and(
            eq(companyTable.tenantId, ctx.tenantId),
            isNull(companyTable.deletedAt),
            domain ? eq(companyTable.domain, domain) : eq(companyTable.name, name),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertCompany(ctx: TenantContext, values: CompanyInsert): Promise<CompanyRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(companyTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async updateCompany(
    ctx: TenantContext,
    id: string,
    patch: Partial<CompanyInsert>,
  ): Promise<CompanyRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(companyTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(companyTable.tenantId, ctx.tenantId),
            eq(companyTable.id, id),
            isNull(companyTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteCompany(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(companyTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(companyTable.tenantId, ctx.tenantId),
            eq(companyTable.id, id),
            isNull(companyTable.deletedAt),
          ),
        )
        .returning({ id: companyTable.id }),
    );
    return rows.length > 0;
  },

  async restoreCompany(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(companyTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(companyTable.tenantId, ctx.tenantId),
            eq(companyTable.id, id),
            isNotNull(companyTable.deletedAt),
          ),
        )
        .returning({ id: companyTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteCompany(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(companyTable)
        .where(and(eq(companyTable.tenantId, ctx.tenantId), eq(companyTable.id, id)))
        .returning({ id: companyTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ contact ══════════════════════════════════
  // Tenant-scoped; optionally filter by `workspaceId` (contacts belong to a ws)
  // and/or `companyId`. Filters are app-level (no FK).
  async listContacts(
    ctx: TenantContext,
    filter?: { workspaceId?: string; companyId?: string; segment?: string },
  ): Promise<ContactRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(contactTable)
        .where(
          and(
            eq(contactTable.tenantId, ctx.tenantId),
            isNull(contactTable.deletedAt),
            filter?.workspaceId ? eq(contactTable.workspaceId, filter.workspaceId) : undefined,
            filter?.companyId ? eq(contactTable.companyId, filter.companyId) : undefined,
            filter?.segment ? eq(contactTable.segment, filter.segment) : undefined,
          ),
        )
        .orderBy(desc(contactTable.createdAt)),
    );
  },

  /**
   * Keyset-paginated live contacts (newest first). Fetches `limit + 1` to detect
   * a further page, returns the trimmed slice + an opaque `nextCursor` (null when
   * exhausted). Walks the `contact_live_idx` partial index.
   */
  async pageContacts(
    ctx: TenantContext,
    filter?: { workspaceId?: string; companyId?: string; segment?: string },
    page?: PageParams,
  ): Promise<Page<ContactRow>> {
    const limit = page?.limit ?? DEFAULT_PAGE_LIMIT;
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(contactTable)
        .where(
          and(
            eq(contactTable.tenantId, ctx.tenantId),
            isNull(contactTable.deletedAt),
            filter?.workspaceId ? eq(contactTable.workspaceId, filter.workspaceId) : undefined,
            filter?.companyId ? eq(contactTable.companyId, filter.companyId) : undefined,
            filter?.segment ? eq(contactTable.segment, filter.segment) : undefined,
            keysetBefore(contactTable, page?.cursor),
          ),
        )
        .orderBy(desc(contactTable.createdAt), desc(contactTable.id))
        .limit(limit + 1),
    );
    return toPage(rows, limit);
  },

  async listTrashedContacts(ctx: TenantContext): Promise<ContactRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(contactTable)
        .where(and(eq(contactTable.tenantId, ctx.tenantId), isNotNull(contactTable.deletedAt)))
        .orderBy(desc(contactTable.deletedAt)),
    );
  },

  async getContact(ctx: TenantContext, id: string): Promise<ContactRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(contactTable)
        .where(
          and(
            eq(contactTable.tenantId, ctx.tenantId),
            eq(contactTable.id, id),
            isNull(contactTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Live contacts pointing at a company (delete-guard / cascade for company). */
  async listContactsByCompany(ctx: TenantContext, companyId: string): Promise<ContactRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(contactTable)
        .where(
          and(
            eq(contactTable.tenantId, ctx.tenantId),
            eq(contactTable.companyId, companyId),
            isNull(contactTable.deletedAt),
          ),
        ),
    );
  },

  /**
   * Dedup lookup for channel-agnostic ingest: a live contact with this exact
   * `full_name` in the given company scope (companyId null = the tenant pool, no
   * company). Lets the graph ingest UPSERT a Person node instead of duplicating.
   */
  async findContactByNameInCompany(
    ctx: TenantContext,
    fullName: string,
    companyId: string | null,
  ): Promise<ContactRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(contactTable)
        .where(
          and(
            eq(contactTable.tenantId, ctx.tenantId),
            isNull(contactTable.deletedAt),
            eq(contactTable.fullName, fullName),
            companyId ? eq(contactTable.companyId, companyId) : isNull(contactTable.companyId),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /**
   * Dedup lookup for order/lead ingest: a live contact matching the given `phone`
   * (against either `phone` or `whatsapp`) OR `email`. Lets a paid marketplace
   * order UPSERT its buyer into an EXISTING CRM contact instead of duplicating.
   * Returns undefined when neither key is supplied or nothing matches.
   */
  async findContactByPhoneOrEmail(
    ctx: TenantContext,
    keys: { phone?: string | null; email?: string | null },
  ): Promise<ContactRow | undefined> {
    const phone = keys.phone?.trim() || null;
    const email = keys.email?.trim() || null;
    if (!phone && !email) return undefined;
    const orClauses = [
      phone ? eq(contactTable.phone, phone) : undefined,
      phone ? eq(contactTable.whatsapp, phone) : undefined,
      email ? eq(contactTable.email, email) : undefined,
    ].filter(Boolean);
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(contactTable)
        .where(
          and(
            eq(contactTable.tenantId, ctx.tenantId),
            isNull(contactTable.deletedAt),
            or(...orClauses),
          ),
        )
        .orderBy(desc(contactTable.createdAt))
        .limit(1),
    );
    return row;
  },

  async insertContact(ctx: TenantContext, values: ContactInsert): Promise<ContactRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(contactTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async updateContact(
    ctx: TenantContext,
    id: string,
    patch: Partial<ContactInsert>,
  ): Promise<ContactRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(contactTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(contactTable.tenantId, ctx.tenantId),
            eq(contactTable.id, id),
            isNull(contactTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteContact(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(contactTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(contactTable.tenantId, ctx.tenantId),
            eq(contactTable.id, id),
            isNull(contactTable.deletedAt),
          ),
        )
        .returning({ id: contactTable.id }),
    );
    return rows.length > 0;
  },

  async restoreContact(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(contactTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(contactTable.tenantId, ctx.tenantId),
            eq(contactTable.id, id),
            isNotNull(contactTable.deletedAt),
          ),
        )
        .returning({ id: contactTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteContact(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(contactTable)
        .where(and(eq(contactTable.tenantId, ctx.tenantId), eq(contactTable.id, id)))
        .returning({ id: contactTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ pipeline ═════════════════════════════════
  async listPipelines(ctx: TenantContext, workspaceId?: string): Promise<PipelineRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(pipelineTable)
        .where(
          and(
            eq(pipelineTable.tenantId, ctx.tenantId),
            isNull(pipelineTable.deletedAt),
            workspaceId ? eq(pipelineTable.workspaceId, workspaceId) : undefined,
          ),
        )
        .orderBy(desc(pipelineTable.createdAt)),
    );
  },

  async listTrashedPipelines(ctx: TenantContext): Promise<PipelineRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(pipelineTable)
        .where(and(eq(pipelineTable.tenantId, ctx.tenantId), isNotNull(pipelineTable.deletedAt)))
        .orderBy(desc(pipelineTable.deletedAt)),
    );
  },

  async getPipeline(ctx: TenantContext, id: string): Promise<PipelineRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(pipelineTable)
        .where(
          and(
            eq(pipelineTable.tenantId, ctx.tenantId),
            eq(pipelineTable.id, id),
            isNull(pipelineTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertPipeline(ctx: TenantContext, values: PipelineInsert): Promise<PipelineRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(pipelineTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async updatePipeline(
    ctx: TenantContext,
    id: string,
    patch: Partial<PipelineInsert>,
  ): Promise<PipelineRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(pipelineTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(pipelineTable.tenantId, ctx.tenantId),
            eq(pipelineTable.id, id),
            isNull(pipelineTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeletePipeline(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(pipelineTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(pipelineTable.tenantId, ctx.tenantId),
            eq(pipelineTable.id, id),
            isNull(pipelineTable.deletedAt),
          ),
        )
        .returning({ id: pipelineTable.id }),
    );
    return rows.length > 0;
  },

  async restorePipeline(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(pipelineTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(pipelineTable.tenantId, ctx.tenantId),
            eq(pipelineTable.id, id),
            isNotNull(pipelineTable.deletedAt),
          ),
        )
        .returning({ id: pipelineTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeletePipeline(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(pipelineTable)
        .where(and(eq(pipelineTable.tenantId, ctx.tenantId), eq(pipelineTable.id, id)))
        .returning({ id: pipelineTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ pipeline_stage ═══════════════════════════
  async listStages(ctx: TenantContext, pipelineId?: string): Promise<PipelineStageRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(pipelineStageTable)
        .where(
          and(
            eq(pipelineStageTable.tenantId, ctx.tenantId),
            isNull(pipelineStageTable.deletedAt),
            pipelineId ? eq(pipelineStageTable.pipelineId, pipelineId) : undefined,
          ),
        )
        .orderBy(asc(pipelineStageTable.sort)),
    );
  },

  async listTrashedStages(ctx: TenantContext): Promise<PipelineStageRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(pipelineStageTable)
        .where(
          and(
            eq(pipelineStageTable.tenantId, ctx.tenantId),
            isNotNull(pipelineStageTable.deletedAt),
          ),
        )
        .orderBy(desc(pipelineStageTable.deletedAt)),
    );
  },

  async getStage(ctx: TenantContext, id: string): Promise<PipelineStageRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(pipelineStageTable)
        .where(
          and(
            eq(pipelineStageTable.tenantId, ctx.tenantId),
            eq(pipelineStageTable.id, id),
            isNull(pipelineStageTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertStage(ctx: TenantContext, values: PipelineStageInsert): Promise<PipelineStageRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(pipelineStageTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async updateStage(
    ctx: TenantContext,
    id: string,
    patch: Partial<PipelineStageInsert>,
  ): Promise<PipelineStageRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(pipelineStageTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(pipelineStageTable.tenantId, ctx.tenantId),
            eq(pipelineStageTable.id, id),
            isNull(pipelineStageTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteStage(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(pipelineStageTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(pipelineStageTable.tenantId, ctx.tenantId),
            eq(pipelineStageTable.id, id),
            isNull(pipelineStageTable.deletedAt),
          ),
        )
        .returning({ id: pipelineStageTable.id }),
    );
    return rows.length > 0;
  },

  async restoreStage(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(pipelineStageTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(pipelineStageTable.tenantId, ctx.tenantId),
            eq(pipelineStageTable.id, id),
            isNotNull(pipelineStageTable.deletedAt),
          ),
        )
        .returning({ id: pipelineStageTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteStage(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(pipelineStageTable)
        .where(and(eq(pipelineStageTable.tenantId, ctx.tenantId), eq(pipelineStageTable.id, id)))
        .returning({ id: pipelineStageTable.id }),
    );
    return rows.length > 0;
  },

  /** Bulk soft/restore of a pipeline's stages (cascade when the pipeline is trashed). */
  async setStagesDeletedByPipeline(
    ctx: TenantContext,
    pipelineIds: string[],
    deleted: boolean,
  ): Promise<void> {
    if (pipelineIds.length === 0) return;
    await withTenant(ctx, (tx) =>
      tx
        .update(pipelineStageTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(pipelineStageTable.tenantId, ctx.tenantId),
            inArray(pipelineStageTable.pipelineId, pipelineIds),
          ),
        ),
    );
  },

  async hardDeleteStagesByPipeline(ctx: TenantContext, pipelineId: string): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .delete(pipelineStageTable)
        .where(
          and(
            eq(pipelineStageTable.tenantId, ctx.tenantId),
            eq(pipelineStageTable.pipelineId, pipelineId),
          ),
        ),
    );
  },

  // ═══════════════════════ deal ═════════════════════════════════════
  async listDeals(
    ctx: TenantContext,
    filter?: { pipelineId?: string; stageId?: string; contactId?: string; workspaceId?: string },
  ): Promise<DealRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(dealTable)
        .where(
          and(
            eq(dealTable.tenantId, ctx.tenantId),
            isNull(dealTable.deletedAt),
            filter?.pipelineId ? eq(dealTable.pipelineId, filter.pipelineId) : undefined,
            filter?.stageId ? eq(dealTable.stageId, filter.stageId) : undefined,
            filter?.contactId ? eq(dealTable.contactId, filter.contactId) : undefined,
            filter?.workspaceId ? eq(dealTable.workspaceId, filter.workspaceId) : undefined,
          ),
        )
        .orderBy(desc(dealTable.createdAt)),
    );
  },

  /**
   * Keyset-paginated live deals (newest first). Same `limit + 1` over-fetch as
   * `pageContacts`; walks the `deal_live_idx` partial index.
   */
  async pageDeals(
    ctx: TenantContext,
    filter?: { pipelineId?: string; stageId?: string; contactId?: string; workspaceId?: string },
    page?: PageParams,
  ): Promise<Page<DealRow>> {
    const limit = page?.limit ?? DEFAULT_PAGE_LIMIT;
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(dealTable)
        .where(
          and(
            eq(dealTable.tenantId, ctx.tenantId),
            isNull(dealTable.deletedAt),
            filter?.pipelineId ? eq(dealTable.pipelineId, filter.pipelineId) : undefined,
            filter?.stageId ? eq(dealTable.stageId, filter.stageId) : undefined,
            filter?.contactId ? eq(dealTable.contactId, filter.contactId) : undefined,
            filter?.workspaceId ? eq(dealTable.workspaceId, filter.workspaceId) : undefined,
            keysetBefore(dealTable, page?.cursor),
          ),
        )
        .orderBy(desc(dealTable.createdAt), desc(dealTable.id))
        .limit(limit + 1),
    );
    return toPage(rows, limit);
  },

  async listTrashedDeals(ctx: TenantContext): Promise<DealRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(dealTable)
        .where(and(eq(dealTable.tenantId, ctx.tenantId), isNotNull(dealTable.deletedAt)))
        .orderBy(desc(dealTable.deletedAt)),
    );
  },

  async getDeal(ctx: TenantContext, id: string): Promise<DealRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(dealTable)
        .where(
          and(
            eq(dealTable.tenantId, ctx.tenantId),
            eq(dealTable.id, id),
            isNull(dealTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Live deals attached to a contact (cascade when a contact is trashed). */
  async listDealsByContact(ctx: TenantContext, contactId: string): Promise<DealRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(dealTable)
        .where(
          and(
            eq(dealTable.tenantId, ctx.tenantId),
            eq(dealTable.contactId, contactId),
            isNull(dealTable.deletedAt),
          ),
        ),
    );
  },

  async insertDeal(ctx: TenantContext, values: DealInsert): Promise<DealRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(dealTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async updateDeal(
    ctx: TenantContext,
    id: string,
    patch: Partial<DealInsert>,
  ): Promise<DealRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(dealTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(dealTable.tenantId, ctx.tenantId),
            eq(dealTable.id, id),
            isNull(dealTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteDeal(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(dealTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(dealTable.tenantId, ctx.tenantId),
            eq(dealTable.id, id),
            isNull(dealTable.deletedAt),
          ),
        )
        .returning({ id: dealTable.id }),
    );
    return rows.length > 0;
  },

  async restoreDeal(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(dealTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(dealTable.tenantId, ctx.tenantId),
            eq(dealTable.id, id),
            isNotNull(dealTable.deletedAt),
          ),
        )
        .returning({ id: dealTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteDeal(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(dealTable)
        .where(and(eq(dealTable.tenantId, ctx.tenantId), eq(dealTable.id, id)))
        .returning({ id: dealTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ activity ═════════════════════════════════
  async listActivities(
    ctx: TenantContext,
    filter?: { subjectType?: string; subjectId?: string },
  ): Promise<ActivityRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(activityTable)
        .where(
          and(
            eq(activityTable.tenantId, ctx.tenantId),
            isNull(activityTable.deletedAt),
            filter?.subjectType ? eq(activityTable.subjectType, filter.subjectType) : undefined,
            filter?.subjectId ? eq(activityTable.subjectId, filter.subjectId) : undefined,
          ),
        )
        .orderBy(desc(activityTable.createdAt)),
    );
  },

  async listTrashedActivities(ctx: TenantContext): Promise<ActivityRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(activityTable)
        .where(and(eq(activityTable.tenantId, ctx.tenantId), isNotNull(activityTable.deletedAt)))
        .orderBy(desc(activityTable.deletedAt)),
    );
  },

  async getActivity(ctx: TenantContext, id: string): Promise<ActivityRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(activityTable)
        .where(
          and(
            eq(activityTable.tenantId, ctx.tenantId),
            eq(activityTable.id, id),
            isNull(activityTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Live activities on a subject (cascade when the subject is trashed). */
  async listActivitiesBySubject(
    ctx: TenantContext,
    subjectType: string,
    subjectId: string,
  ): Promise<ActivityRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(activityTable)
        .where(
          and(
            eq(activityTable.tenantId, ctx.tenantId),
            eq(activityTable.subjectType, subjectType),
            eq(activityTable.subjectId, subjectId),
            isNull(activityTable.deletedAt),
          ),
        ),
    );
  },

  async insertActivity(ctx: TenantContext, values: ActivityInsert): Promise<ActivityRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(activityTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async updateActivity(
    ctx: TenantContext,
    id: string,
    patch: Partial<ActivityInsert>,
  ): Promise<ActivityRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(activityTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(activityTable.tenantId, ctx.tenantId),
            eq(activityTable.id, id),
            isNull(activityTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteActivity(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(activityTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(activityTable.tenantId, ctx.tenantId),
            eq(activityTable.id, id),
            isNull(activityTable.deletedAt),
          ),
        )
        .returning({ id: activityTable.id }),
    );
    return rows.length > 0;
  },

  async restoreActivity(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(activityTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(activityTable.tenantId, ctx.tenantId),
            eq(activityTable.id, id),
            isNotNull(activityTable.deletedAt),
          ),
        )
        .returning({ id: activityTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteActivity(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(activityTable)
        .where(and(eq(activityTable.tenantId, ctx.tenantId), eq(activityTable.id, id)))
        .returning({ id: activityTable.id }),
    );
    return rows.length > 0;
  },

  /** Set-based soft-delete/restore of every activity on ONE subject (cascade). */
  async setActivitiesDeletedBySubject(
    ctx: TenantContext,
    subjectType: string,
    subjectId: string,
    deleted: boolean,
  ): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .update(activityTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(activityTable.tenantId, ctx.tenantId),
            eq(activityTable.subjectType, subjectType),
            eq(activityTable.subjectId, subjectId),
          ),
        ),
    );
  },

  /** Set-based hard-delete of every activity on ONE subject (purge cascade). */
  async hardDeleteActivitiesBySubject(
    ctx: TenantContext,
    subjectType: string,
    subjectId: string,
  ): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .delete(activityTable)
        .where(
          and(
            eq(activityTable.tenantId, ctx.tenantId),
            eq(activityTable.subjectType, subjectType),
            eq(activityTable.subjectId, subjectId),
          ),
        ),
    );
  },

  // ═══════════════════════ set-based cascades (one txn) ══════════════
  // The soft-delete/restore of a parent fans out to its children. Doing this
  // child-by-child opened a fresh `withTenant` (BEGIN + 3×set_config + COMMIT)
  // PER ROW — thousands of round-trips and NON-atomic (perf audit #14). These
  // helpers run the whole cascade SET-BASED inside ONE transaction.

  /**
   * Cascade a CONTACT soft-delete/restore over a SET of contacts in one txn:
   * flips their deals, then every activity attached to those contacts OR to those
   * deals. Idempotent (`restore` only touches rows whose `deleted_at` matches the
   * direction is unnecessary here — a blanket set mirrors the previous per-row
   * behaviour). Returns the affected deal ids (caller may need them; unused today).
   */
  async cascadeContactsDeleted(
    ctx: TenantContext,
    contactIds: string[],
    deleted: boolean,
  ): Promise<void> {
    if (contactIds.length === 0) return;
    await withTenant(ctx, async (tx) => {
      await cascadeContactsTx(tx, ctx.tenantId, contactIds, deleted);
    });
  },

  /**
   * Cascade a COMPANY soft-delete/restore in one txn: its live contacts → their
   * deals + activities, plus the company's own activities. Resolves the contact
   * set inside the SAME transaction so the read + all writes are atomic.
   */
  async cascadeCompanyDeleted(
    ctx: TenantContext,
    companyId: string,
    deleted: boolean,
  ): Promise<void> {
    await withTenant(ctx, async (tx) => {
      // On delete we trash the company's LIVE contacts; on restore we revive the
      // contacts that were trashed (mirrors the prior per-row cascade, which only
      // saw live children at delete time).
      const childContacts = await tx
        .select({ id: contactTable.id })
        .from(contactTable)
        .where(
          and(
            eq(contactTable.tenantId, ctx.tenantId),
            eq(contactTable.companyId, companyId),
            deleted ? isNull(contactTable.deletedAt) : isNotNull(contactTable.deletedAt),
          ),
        );
      const contactIds = childContacts.map((c) => c.id);
      if (contactIds.length > 0) {
        // Flip the contacts themselves, then their deal/activity subtree.
        await tx
          .update(contactTable)
          .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
          .where(
            and(eq(contactTable.tenantId, ctx.tenantId), inArray(contactTable.id, contactIds)),
          );
        await cascadeContactsTx(tx, ctx.tenantId, contactIds, deleted);
      }
      // The company's own activities (subject_type = 'company').
      await tx
        .update(activityTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(activityTable.tenantId, ctx.tenantId),
            eq(activityTable.subjectType, "company"),
            eq(activityTable.subjectId, companyId),
          ),
        );
    });
  },
};

// ── transactional cascade primitives (operate on an open `tx`) ────────────────
type TxArg = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * Flip a set of contacts' deal + activity subtree on an already-open transaction.
 * Set-based: one UPDATE for the deals, one for all the activities (contact + deal
 * subjects), instead of a query-then-loop per child.
 */
async function cascadeContactsTx(
  tx: TxArg,
  tenantId: string,
  contactIds: string[],
  deleted: boolean,
): Promise<void> {
  if (contactIds.length === 0) return;
  const stamp = deleted ? new Date() : null;
  // 1) The contacts' deals (collect their ids for the activity subjects).
  const deals = await tx
    .update(dealTable)
    .set({ deletedAt: stamp, updatedAt: new Date() })
    .where(and(eq(dealTable.tenantId, tenantId), inArray(dealTable.contactId, contactIds)))
    .returning({ id: dealTable.id });
  const dealIds = deals.map((d) => d.id);
  // 2) Every activity on those contacts OR those deals — one set-based UPDATE.
  const subjectClauses = [
    and(eq(activityTable.subjectType, "contact"), inArray(activityTable.subjectId, contactIds)),
    dealIds.length > 0
      ? and(eq(activityTable.subjectType, "deal"), inArray(activityTable.subjectId, dealIds))
      : undefined,
  ];
  await tx
    .update(activityTable)
    .set({ deletedAt: stamp, updatedAt: new Date() })
    .where(and(eq(activityTable.tenantId, tenantId), or(...subjectClauses)));
}
