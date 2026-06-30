import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  discoveryJobTable,
  discoveryResultTable,
  enrichmentRecordTable,
  type DiscoveryJobRow,
  type DiscoveryJobInsert,
  type DiscoveryResultRow,
  type DiscoveryResultInsert,
  type EnrichmentRecordRow,
  type EnrichmentRecordInsert,
} from "./schema";

/**
 * enrichment domain repo — the ONLY place that touches `discovery_job`,
 * `discovery_result` and `enrichment_record`. All three are TENANT-scoped, so
 * every read/write is wrapped in `withTenant` and filtered by `tenant_id`.
 *
 * Each entity exposes the soft-delete contract: list/get filter
 * `deleted_at IS NULL`; `*Trashed` flips to ONLY soft-deleted rows; `softDelete`
 * sets `deleted_at`; `restore` clears it (only matching already-trashed rows);
 * `hardDelete` is a real SQL DELETE (purge). The service needs cross-entity reads
 * for cascade (a job's results) and the push flow (a result's records / a
 * contact's record) — exposed here as `listResultsByJob`, bulk
 * `setResultsDeletedByJob` / `hardDeleteResultsByJob`, plus `getRecordByContact`.
 */
export const enrichmentRepo = {
  // ═══════════════════════ discovery_job ════════════════════════════
  // Tenant-scoped; optionally filter by `workspaceId` / `channel` / `status`.
  // Newest run first.
  async listJobs(
    ctx: TenantContext,
    filter?: { workspaceId?: string; channel?: string; status?: string },
  ): Promise<DiscoveryJobRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(discoveryJobTable)
        .where(
          and(
            eq(discoveryJobTable.tenantId, ctx.tenantId),
            isNull(discoveryJobTable.deletedAt),
            filter?.workspaceId ? eq(discoveryJobTable.workspaceId, filter.workspaceId) : undefined,
            filter?.channel ? eq(discoveryJobTable.channel, filter.channel) : undefined,
            filter?.status ? eq(discoveryJobTable.status, filter.status) : undefined,
          ),
        )
        .orderBy(desc(discoveryJobTable.createdAt)),
    );
  },

  async listTrashedJobs(ctx: TenantContext): Promise<DiscoveryJobRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(discoveryJobTable)
        .where(
          and(eq(discoveryJobTable.tenantId, ctx.tenantId), isNotNull(discoveryJobTable.deletedAt)),
        )
        .orderBy(desc(discoveryJobTable.deletedAt)),
    );
  },

  async getJob(ctx: TenantContext, id: string): Promise<DiscoveryJobRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(discoveryJobTable)
        .where(
          and(
            eq(discoveryJobTable.tenantId, ctx.tenantId),
            eq(discoveryJobTable.id, id),
            isNull(discoveryJobTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertJob(ctx: TenantContext, values: DiscoveryJobInsert): Promise<DiscoveryJobRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(discoveryJobTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async updateJob(
    ctx: TenantContext,
    id: string,
    patch: Partial<DiscoveryJobInsert>,
  ): Promise<DiscoveryJobRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(discoveryJobTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(discoveryJobTable.tenantId, ctx.tenantId),
            eq(discoveryJobTable.id, id),
            isNull(discoveryJobTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteJob(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(discoveryJobTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(discoveryJobTable.tenantId, ctx.tenantId),
            eq(discoveryJobTable.id, id),
            isNull(discoveryJobTable.deletedAt),
          ),
        )
        .returning({ id: discoveryJobTable.id }),
    );
    return rows.length > 0;
  },

  async restoreJob(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(discoveryJobTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(discoveryJobTable.tenantId, ctx.tenantId),
            eq(discoveryJobTable.id, id),
            isNotNull(discoveryJobTable.deletedAt),
          ),
        )
        .returning({ id: discoveryJobTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteJob(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(discoveryJobTable)
        .where(and(eq(discoveryJobTable.tenantId, ctx.tenantId), eq(discoveryJobTable.id, id)))
        .returning({ id: discoveryJobTable.id }),
    );
    return rows.length > 0;
  },

  // ═══════════════════════ discovery_result ═════════════════════════
  // Tenant-scoped; filter by `jobId` / `workspaceId` / `savedOnly`. Oldest first
  // (results read in capture order).
  async listResults(
    ctx: TenantContext,
    filter?: { jobId?: string; workspaceId?: string; savedOnly?: boolean },
  ): Promise<DiscoveryResultRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(discoveryResultTable)
        .where(
          and(
            eq(discoveryResultTable.tenantId, ctx.tenantId),
            isNull(discoveryResultTable.deletedAt),
            filter?.jobId ? eq(discoveryResultTable.jobId, filter.jobId) : undefined,
            filter?.workspaceId
              ? eq(discoveryResultTable.workspaceId, filter.workspaceId)
              : undefined,
            filter?.savedOnly ? isNotNull(discoveryResultTable.savedAt) : undefined,
          ),
        )
        .orderBy(asc(discoveryResultTable.createdAt)),
    );
  },

  async listTrashedResults(ctx: TenantContext): Promise<DiscoveryResultRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(discoveryResultTable)
        .where(
          and(
            eq(discoveryResultTable.tenantId, ctx.tenantId),
            isNotNull(discoveryResultTable.deletedAt),
          ),
        )
        .orderBy(desc(discoveryResultTable.deletedAt)),
    );
  },

  async getResult(ctx: TenantContext, id: string): Promise<DiscoveryResultRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(discoveryResultTable)
        .where(
          and(
            eq(discoveryResultTable.tenantId, ctx.tenantId),
            eq(discoveryResultTable.id, id),
            isNull(discoveryResultTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** Live results of a job (cascade + rollup when a job is trashed/counted). */
  async listResultsByJob(ctx: TenantContext, jobId: string): Promise<DiscoveryResultRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(discoveryResultTable)
        .where(
          and(
            eq(discoveryResultTable.tenantId, ctx.tenantId),
            eq(discoveryResultTable.jobId, jobId),
            isNull(discoveryResultTable.deletedAt),
          ),
        )
        .orderBy(asc(discoveryResultTable.createdAt)),
    );
  },

  async insertResult(
    ctx: TenantContext,
    values: DiscoveryResultInsert,
  ): Promise<DiscoveryResultRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(discoveryResultTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  /**
   * Bulk-insert a discovery job's results in ONE statement (audit #32 — replaces a
   * per-row insert loop). Empty input is a no-op. Every row is force-stamped with
   * the caller's `tenant_id` (belt-and-suspenders alongside RLS).
   */
  async insertResults(
    ctx: TenantContext,
    rows: DiscoveryResultInsert[],
  ): Promise<DiscoveryResultRow[]> {
    if (rows.length === 0) return [];
    return withTenant(ctx, (tx) =>
      tx
        .insert(discoveryResultTable)
        .values(rows.map((r) => ({ ...r, tenantId: ctx.tenantId })))
        .returning(),
    );
  },

  async updateResult(
    ctx: TenantContext,
    id: string,
    patch: Partial<DiscoveryResultInsert>,
  ): Promise<DiscoveryResultRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(discoveryResultTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(discoveryResultTable.tenantId, ctx.tenantId),
            eq(discoveryResultTable.id, id),
            isNull(discoveryResultTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteResult(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(discoveryResultTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(discoveryResultTable.tenantId, ctx.tenantId),
            eq(discoveryResultTable.id, id),
            isNull(discoveryResultTable.deletedAt),
          ),
        )
        .returning({ id: discoveryResultTable.id }),
    );
    return rows.length > 0;
  },

  async restoreResult(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(discoveryResultTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(discoveryResultTable.tenantId, ctx.tenantId),
            eq(discoveryResultTable.id, id),
            isNotNull(discoveryResultTable.deletedAt),
          ),
        )
        .returning({ id: discoveryResultTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteResult(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(discoveryResultTable)
        .where(
          and(eq(discoveryResultTable.tenantId, ctx.tenantId), eq(discoveryResultTable.id, id)),
        )
        .returning({ id: discoveryResultTable.id }),
    );
    return rows.length > 0;
  },

  /** Bulk soft/restore of a job's results (cascade with the job). */
  async setResultsDeletedByJob(
    ctx: TenantContext,
    jobIds: string[],
    deleted: boolean,
  ): Promise<void> {
    if (jobIds.length === 0) return;
    await withTenant(ctx, (tx) =>
      tx
        .update(discoveryResultTable)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(
          and(
            eq(discoveryResultTable.tenantId, ctx.tenantId),
            inArray(discoveryResultTable.jobId, jobIds),
          ),
        ),
    );
  },

  async hardDeleteResultsByJob(ctx: TenantContext, jobId: string): Promise<void> {
    await withTenant(ctx, (tx) =>
      tx
        .delete(discoveryResultTable)
        .where(
          and(
            eq(discoveryResultTable.tenantId, ctx.tenantId),
            eq(discoveryResultTable.jobId, jobId),
          ),
        ),
    );
  },

  // ═══════════════════════ enrichment_record ════════════════════════
  // Tenant-scoped; filter by `contactId` / `workspaceId` / `status`. Newest first.
  async listRecords(
    ctx: TenantContext,
    filter?: { contactId?: string; workspaceId?: string; status?: string },
  ): Promise<EnrichmentRecordRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(enrichmentRecordTable)
        .where(
          and(
            eq(enrichmentRecordTable.tenantId, ctx.tenantId),
            isNull(enrichmentRecordTable.deletedAt),
            filter?.contactId ? eq(enrichmentRecordTable.contactId, filter.contactId) : undefined,
            filter?.workspaceId
              ? eq(enrichmentRecordTable.workspaceId, filter.workspaceId)
              : undefined,
            filter?.status ? eq(enrichmentRecordTable.status, filter.status) : undefined,
          ),
        )
        .orderBy(desc(enrichmentRecordTable.createdAt)),
    );
  },

  async listTrashedRecords(ctx: TenantContext): Promise<EnrichmentRecordRow[]> {
    return withTenant(ctx, (tx) =>
      tx
        .select()
        .from(enrichmentRecordTable)
        .where(
          and(
            eq(enrichmentRecordTable.tenantId, ctx.tenantId),
            isNotNull(enrichmentRecordTable.deletedAt),
          ),
        )
        .orderBy(desc(enrichmentRecordTable.deletedAt)),
    );
  },

  async getRecord(ctx: TenantContext, id: string): Promise<EnrichmentRecordRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(enrichmentRecordTable)
        .where(
          and(
            eq(enrichmentRecordTable.tenantId, ctx.tenantId),
            eq(enrichmentRecordTable.id, id),
            isNull(enrichmentRecordTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  /** The live enrichment record for a contact (one per contact; dedup on queue). */
  async getRecordByContact(
    ctx: TenantContext,
    contactId: string,
  ): Promise<EnrichmentRecordRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(enrichmentRecordTable)
        .where(
          and(
            eq(enrichmentRecordTable.tenantId, ctx.tenantId),
            eq(enrichmentRecordTable.contactId, contactId),
            isNull(enrichmentRecordTable.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  },

  async insertRecord(
    ctx: TenantContext,
    values: EnrichmentRecordInsert,
  ): Promise<EnrichmentRecordRow> {
    const [row] = await withTenant(ctx, (tx) =>
      tx.insert(enrichmentRecordTable).values({ ...values, tenantId: ctx.tenantId }).returning(),
    );
    return row;
  },

  async updateRecord(
    ctx: TenantContext,
    id: string,
    patch: Partial<EnrichmentRecordInsert>,
  ): Promise<EnrichmentRecordRow | undefined> {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .update(enrichmentRecordTable)
        .set({ ...patch, tenantId: ctx.tenantId, updatedAt: new Date() })
        .where(
          and(
            eq(enrichmentRecordTable.tenantId, ctx.tenantId),
            eq(enrichmentRecordTable.id, id),
            isNull(enrichmentRecordTable.deletedAt),
          ),
        )
        .returning(),
    );
    return row;
  },

  async softDeleteRecord(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(enrichmentRecordTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(enrichmentRecordTable.tenantId, ctx.tenantId),
            eq(enrichmentRecordTable.id, id),
            isNull(enrichmentRecordTable.deletedAt),
          ),
        )
        .returning({ id: enrichmentRecordTable.id }),
    );
    return rows.length > 0;
  },

  async restoreRecord(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .update(enrichmentRecordTable)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(enrichmentRecordTable.tenantId, ctx.tenantId),
            eq(enrichmentRecordTable.id, id),
            isNotNull(enrichmentRecordTable.deletedAt),
          ),
        )
        .returning({ id: enrichmentRecordTable.id }),
    );
    return rows.length > 0;
  },

  async hardDeleteRecord(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .delete(enrichmentRecordTable)
        .where(
          and(eq(enrichmentRecordTable.tenantId, ctx.tenantId), eq(enrichmentRecordTable.id, id)),
        )
        .returning({ id: enrichmentRecordTable.id }),
    );
    return rows.length > 0;
  },
};
