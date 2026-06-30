import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError, type Page } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { crmRepo, type PageParams } from "./repo";
import type {
  CompanyRow,
  ContactRow,
  PipelineRow,
  PipelineStageRow,
  DealRow,
  ActivityRow,
} from "./schema";

/**
 * crm domain service — business logic + validation + cross-module side effects
 * (audit) + app-level cascade. Routes stay thin: parse → call a method → wrap
 * with the {ok,error} envelope.
 *
 * Owns six tables (company_v2, contact, pipeline, pipeline_stage, deal,
 * activity). Referential integrity is enforced HERE (app layer), never via DB
 * FKs (none exist): a contact's `company_id`/`workspace_id`, a deal's
 * `contact_id`/`company_id`/`pipeline_id`/`stage_id`, and a stage's `pipeline_id`
 * are validated against live rows before write. Soft-delete/restore/purge of a
 * parent CASCADES to its children in the app layer:
 *   - company  → its contacts (segment leads) and their activities.
 *   - contact  → its deals + activities.
 *   - deal     → its activities.
 *   - pipeline → its stages.
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo
 * scopes all reads/writes to `ctx.tenantId` inside `withTenant`.
 */

const CONTACT_SEGMENTS = ["b2c", "b2b", "unknown"] as const;
const ENRICHMENT_STATUSES = ["none", "pending", "enriched", "failed"] as const;
const LIFECYCLE_STAGES = ["lead", "mql", "sql", "customer", "churned"] as const;
const DEAL_STATUSES = ["open", "won", "lost"] as const;
const ACTIVITY_SUBJECTS = ["contact", "company", "deal"] as const;
const ACTIVITY_TYPES = [
  "call",
  "email",
  "meeting",
  "whatsapp",
  "task",
  "note",
  "stage_change",
] as const;

// ── input shapes ─────────────────────────────────────────────────────────────
export interface CreateCompanyInput {
  name: string;
  domain?: string | null;
  industry?: string | null;
  industryId?: string | null; // taxonomy soft ref (classify-on-enrich)
  size?: string | null;
  hqCountry?: string | null;
  hqCity?: string | null;
  website?: string | null;
  summary?: string | null;
  techStack?: string[];
  socials?: Record<string, string> | null;
  ownerUserId?: string | null;
  status?: string;
  source?: string | null;
}
export type UpdateCompanyInput = Partial<CreateCompanyInput>;

export interface CreateContactInput {
  fullName: string;
  companyId?: string | null;
  workspaceId?: string | null;
  title?: string | null;
  occupationId?: string | null; // taxonomy soft ref (classify-on-enrich)
  department?: string | null;
  seniority?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  city?: string | null;
  location?: string | null;
  channelPreference?: string | null;
  socials?: Record<string, string> | null;
  tags?: string[];
  segment?: string; // b2c|b2b|unknown
  enrichmentStatus?: string; // none|pending|enriched|failed
  fitScore?: number | null;
  fitReason?: string | null;
  lifecycleStage?: string;
  ownerUserId?: string | null;
  consentStatus?: string;
  source?: string | null;
}
export type UpdateContactInput = Partial<CreateContactInput>;

export interface CreatePipelineInput {
  name: string;
  workspaceId?: string | null;
  isDefault?: boolean;
}
export type UpdatePipelineInput = Partial<CreatePipelineInput>;

export interface CreateStageInput {
  pipelineId: string;
  name: string;
  sort?: number;
  probability?: number | null;
  isWon?: boolean;
  isLost?: boolean;
}
export type UpdateStageInput = Partial<Omit<CreateStageInput, "pipelineId">>;

export interface CreateDealInput {
  name: string;
  pipelineId?: string | null;
  stageId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  workspaceId?: string | null;
  productId?: string | null;
  value?: number;
  currency?: string;
  status?: string;
  expectedClose?: string | null;
  lostReason?: string | null;
  sourceChannel?: string | null;
  ownerUserId?: string | null;
}
export type UpdateDealInput = Partial<CreateDealInput>;

export interface CreateActivityInput {
  subjectType: string; // contact|company|deal
  subjectId: string;
  type: string; // call|email|meeting|whatsapp|task|note|stage_change
  title?: string | null;
  body?: string | null;
  dueAt?: string | null;
  doneAt?: string | null;
  actorUserId?: string | null;
  meta?: Record<string, unknown> | null;
}
export type UpdateActivityInput = Partial<CreateActivityInput>;

// ── validation helpers ───────────────────────────────────────────────────────
function assertEnum(
  value: string | undefined,
  allowed: readonly string[],
  field: string,
): string {
  const v = value ?? allowed[0];
  if (!allowed.includes(v)) {
    throw new ServiceError(`${field} harus salah satu dari: ${allowed.join(", ")}`, 400, "validation");
  }
  return v;
}

function assertFitScore(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ServiceError("fit_score harus antara 0 dan 1", 400, "validation");
  }
  return value;
}

function parseDate(value: string | null | undefined, field: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ServiceError(`${field} tidak valid`, 400, "validation");
  }
  return d;
}

export const crmService = {
  // ═══════════════════════ company ══════════════════════════════════
  async listCompanies(ctx: TenantContext): Promise<CompanyRow[]> {
    return crmRepo.listCompanies(ctx);
  },

  async listTrashedCompanies(ctx: TenantContext): Promise<CompanyRow[]> {
    return crmRepo.listTrashedCompanies(ctx);
  },

  async getCompany(ctx: TenantContext, id: string): Promise<CompanyRow> {
    const row = await crmRepo.getCompany(ctx, id);
    if (!row) throw new ServiceError("Perusahaan tidak ditemukan", 404, "not_found");
    return row;
  },

  async createCompany(ctx: TenantContext, input: CreateCompanyInput): Promise<CompanyRow> {
    const name = input.name?.trim();
    if (!name) throw new ServiceError("Nama perusahaan wajib diisi", 400, "validation");
    const row = await crmRepo.insertCompany(ctx, {
      id: "cmp_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      name,
      domain: input.domain ?? null,
      industry: input.industry ?? null,
      industryId: input.industryId ?? null,
      size: input.size ?? null,
      hqCountry: input.hqCountry ?? null,
      hqCity: input.hqCity ?? null,
      website: input.website ?? null,
      summary: input.summary ?? null,
      techStack: input.techStack ?? [],
      socials: input.socials ?? null,
      ownerUserId: input.ownerUserId ?? null,
      status: input.status ?? "active",
      source: input.source ?? null,
    });
    await this.audit(ctx, "crm.company.create", "company", row.id, { name });
    return row;
  },

  async updateCompany(
    ctx: TenantContext,
    id: string,
    input: UpdateCompanyInput,
  ): Promise<CompanyRow> {
    await this.getCompany(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new ServiceError("Nama perusahaan wajib diisi", 400, "validation");
      patch.name = name;
    }
    for (const f of [
      "domain",
      "industry",
      "industryId",
      "size",
      "hqCountry",
      "hqCity",
      "website",
      "summary",
      "socials",
      "ownerUserId",
      "status",
      "source",
    ] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    if (input.techStack !== undefined) patch.techStack = input.techStack;
    const row = await crmRepo.updateCompany(ctx, id, patch);
    if (!row) throw new ServiceError("Perusahaan tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "crm.company.update", "company", id, { fields: Object.keys(patch) });
    return row;
  },

  async softDeleteCompany(ctx: TenantContext, id: string): Promise<void> {
    const ok = await crmRepo.softDeleteCompany(ctx, id);
    if (!ok) throw new ServiceError("Perusahaan tidak ditemukan", 404, "not_found");
    // App-level cascade (one transaction, set-based): the company's contacts +
    // their deals + every related activity + the company's own activities.
    await crmRepo.cascadeCompanyDeleted(ctx, id, true);
    await this.audit(ctx, "crm.company.delete", "company", id);
  },

  async restoreCompany(ctx: TenantContext, id: string): Promise<CompanyRow> {
    const ok = await crmRepo.restoreCompany(ctx, id);
    if (!ok) throw new ServiceError("Perusahaan tidak ada di trash", 404, "not_found");
    // Mirror the cascade on restore (single transaction).
    await crmRepo.cascadeCompanyDeleted(ctx, id, false);
    await this.audit(ctx, "crm.company.restore", "company", id);
    return this.getCompany(ctx, id);
  },

  async hardDeleteCompany(ctx: TenantContext, id: string): Promise<void> {
    const ok = await crmRepo.hardDeleteCompany(ctx, id);
    if (!ok) throw new ServiceError("Perusahaan tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "crm.company.purge", "company", id);
  },

  // ═══════════════════════ contact ══════════════════════════════════
  async listContacts(
    ctx: TenantContext,
    filter?: { workspaceId?: string; companyId?: string; segment?: string },
  ): Promise<ContactRow[]> {
    return crmRepo.listContacts(ctx, filter);
  },

  /** Keyset-paginated live contacts (newest first) — the route's default read. */
  async pageContacts(
    ctx: TenantContext,
    filter?: { workspaceId?: string; companyId?: string; segment?: string },
    page?: PageParams,
  ): Promise<Page<ContactRow>> {
    return crmRepo.pageContacts(ctx, filter, page);
  },

  async listTrashedContacts(ctx: TenantContext): Promise<ContactRow[]> {
    return crmRepo.listTrashedContacts(ctx);
  },

  async getContact(ctx: TenantContext, id: string): Promise<ContactRow> {
    const row = await crmRepo.getContact(ctx, id);
    if (!row) throw new ServiceError("Kontak tidak ditemukan", 404, "not_found");
    return row;
  },

  async createContact(ctx: TenantContext, input: CreateContactInput): Promise<ContactRow> {
    const fullName = input.fullName?.trim();
    if (!fullName) throw new ServiceError("Nama kontak wajib diisi", 400, "validation");
    const segment = assertEnum(input.segment, CONTACT_SEGMENTS, "segment");
    const enrichmentStatus = assertEnum(input.enrichmentStatus, ENRICHMENT_STATUSES, "enrichment_status");
    const lifecycleStage = assertEnum(input.lifecycleStage, LIFECYCLE_STAGES, "lifecycle_stage");
    const fitScore = assertFitScore(input.fitScore);
    // Integrity: a referenced company must be a live row in this tenant.
    if (input.companyId) await this.getCompany(ctx, input.companyId);

    const row = await crmRepo.insertContact(ctx, {
      id: "ctc_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      companyId: input.companyId ?? null,
      workspaceId: input.workspaceId ?? null,
      fullName,
      title: input.title ?? null,
      occupationId: input.occupationId ?? null,
      department: input.department ?? null,
      seniority: input.seniority ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      whatsapp: input.whatsapp ?? null,
      city: input.city ?? null,
      location: input.location ?? null,
      channelPreference: input.channelPreference ?? null,
      socials: input.socials ?? null,
      tags: input.tags ?? [],
      segment,
      enrichmentStatus,
      fitScore,
      fitReason: input.fitReason ?? null,
      lifecycleStage,
      ownerUserId: input.ownerUserId ?? null,
      consentStatus: input.consentStatus ?? "unknown",
      source: input.source ?? null,
    });
    await this.audit(ctx, "crm.contact.create", "contact", row.id, {
      fullName,
      segment,
      workspaceId: input.workspaceId ?? null,
    });
    return row;
  },

  async updateContact(
    ctx: TenantContext,
    id: string,
    input: UpdateContactInput,
  ): Promise<ContactRow> {
    await this.getContact(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.fullName !== undefined) {
      const fullName = input.fullName?.trim();
      if (!fullName) throw new ServiceError("Nama kontak wajib diisi", 400, "validation");
      patch.fullName = fullName;
    }
    if (input.segment !== undefined) patch.segment = assertEnum(input.segment, CONTACT_SEGMENTS, "segment");
    if (input.enrichmentStatus !== undefined)
      patch.enrichmentStatus = assertEnum(input.enrichmentStatus, ENRICHMENT_STATUSES, "enrichment_status");
    if (input.lifecycleStage !== undefined)
      patch.lifecycleStage = assertEnum(input.lifecycleStage, LIFECYCLE_STAGES, "lifecycle_stage");
    if (input.fitScore !== undefined) patch.fitScore = assertFitScore(input.fitScore);
    if (input.companyId !== undefined) {
      if (input.companyId) await this.getCompany(ctx, input.companyId);
      patch.companyId = input.companyId;
    }
    for (const f of [
      "workspaceId",
      "title",
      "occupationId",
      "department",
      "seniority",
      "email",
      "phone",
      "whatsapp",
      "city",
      "location",
      "channelPreference",
      "socials",
      "fitReason",
      "ownerUserId",
      "consentStatus",
      "source",
    ] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    if (input.tags !== undefined) patch.tags = input.tags;
    const row = await crmRepo.updateContact(ctx, id, patch);
    if (!row) throw new ServiceError("Kontak tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "crm.contact.update", "contact", id, { fields: Object.keys(patch) });
    return row;
  },

  async softDeleteContact(ctx: TenantContext, id: string): Promise<void> {
    const ok = await crmRepo.softDeleteContact(ctx, id);
    if (!ok) throw new ServiceError("Kontak tidak ditemukan", 404, "not_found");
    // Cascade the contact's deals + activities in ONE set-based transaction.
    await crmRepo.cascadeContactsDeleted(ctx, [id], true);
    await this.audit(ctx, "crm.contact.delete", "contact", id);
  },

  async restoreContact(ctx: TenantContext, id: string): Promise<ContactRow> {
    const ok = await crmRepo.restoreContact(ctx, id);
    if (!ok) throw new ServiceError("Kontak tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "crm.contact.restore", "contact", id);
    return this.getContact(ctx, id);
  },

  async hardDeleteContact(ctx: TenantContext, id: string): Promise<void> {
    const ok = await crmRepo.hardDeleteContact(ctx, id);
    if (!ok) throw new ServiceError("Kontak tidak ditemukan", 404, "not_found");
    await this.cascadeSubjectActivitiesHard(ctx, "contact", id);
    await this.audit(ctx, "crm.contact.purge", "contact", id);
  },

  // ═══════════════════════ pipeline ═════════════════════════════════
  async listPipelines(ctx: TenantContext, workspaceId?: string): Promise<PipelineRow[]> {
    return crmRepo.listPipelines(ctx, workspaceId);
  },

  async listTrashedPipelines(ctx: TenantContext): Promise<PipelineRow[]> {
    return crmRepo.listTrashedPipelines(ctx);
  },

  async getPipeline(ctx: TenantContext, id: string): Promise<PipelineRow> {
    const row = await crmRepo.getPipeline(ctx, id);
    if (!row) throw new ServiceError("Pipeline tidak ditemukan", 404, "not_found");
    return row;
  },

  async createPipeline(ctx: TenantContext, input: CreatePipelineInput): Promise<PipelineRow> {
    const name = input.name?.trim();
    if (!name) throw new ServiceError("Nama pipeline wajib diisi", 400, "validation");
    const row = await crmRepo.insertPipeline(ctx, {
      id: "ppl_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      name,
      workspaceId: input.workspaceId ?? null,
      isDefault: input.isDefault ?? false,
    });
    await this.audit(ctx, "crm.pipeline.create", "pipeline", row.id, { name });
    return row;
  },

  async updatePipeline(
    ctx: TenantContext,
    id: string,
    input: UpdatePipelineInput,
  ): Promise<PipelineRow> {
    await this.getPipeline(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new ServiceError("Nama pipeline wajib diisi", 400, "validation");
      patch.name = name;
    }
    if (input.workspaceId !== undefined) patch.workspaceId = input.workspaceId;
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
    const row = await crmRepo.updatePipeline(ctx, id, patch);
    if (!row) throw new ServiceError("Pipeline tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "crm.pipeline.update", "pipeline", id, { fields: Object.keys(patch) });
    return row;
  },

  async softDeletePipeline(ctx: TenantContext, id: string): Promise<void> {
    const ok = await crmRepo.softDeletePipeline(ctx, id);
    if (!ok) throw new ServiceError("Pipeline tidak ditemukan", 404, "not_found");
    // App-level cascade: trash the pipeline's stages alongside it.
    await crmRepo.setStagesDeletedByPipeline(ctx, [id], true);
    await this.audit(ctx, "crm.pipeline.delete", "pipeline", id);
  },

  async restorePipeline(ctx: TenantContext, id: string): Promise<PipelineRow> {
    const ok = await crmRepo.restorePipeline(ctx, id);
    if (!ok) throw new ServiceError("Pipeline tidak ada di trash", 404, "not_found");
    await crmRepo.setStagesDeletedByPipeline(ctx, [id], false);
    await this.audit(ctx, "crm.pipeline.restore", "pipeline", id);
    return this.getPipeline(ctx, id);
  },

  async hardDeletePipeline(ctx: TenantContext, id: string): Promise<void> {
    const ok = await crmRepo.hardDeletePipeline(ctx, id);
    if (!ok) throw new ServiceError("Pipeline tidak ditemukan", 404, "not_found");
    await crmRepo.hardDeleteStagesByPipeline(ctx, id);
    await this.audit(ctx, "crm.pipeline.purge", "pipeline", id);
  },

  // ═══════════════════════ pipeline_stage ═══════════════════════════
  async listStages(ctx: TenantContext, pipelineId?: string): Promise<PipelineStageRow[]> {
    return crmRepo.listStages(ctx, pipelineId);
  },

  async listTrashedStages(ctx: TenantContext): Promise<PipelineStageRow[]> {
    return crmRepo.listTrashedStages(ctx);
  },

  async getStage(ctx: TenantContext, id: string): Promise<PipelineStageRow> {
    const row = await crmRepo.getStage(ctx, id);
    if (!row) throw new ServiceError("Stage tidak ditemukan", 404, "not_found");
    return row;
  },

  async createStage(ctx: TenantContext, input: CreateStageInput): Promise<PipelineStageRow> {
    const name = input.name?.trim();
    if (!name) throw new ServiceError("Nama stage wajib diisi", 400, "validation");
    if (!input.pipelineId?.trim())
      throw new ServiceError("pipeline_id wajib diisi", 400, "validation");
    // Integrity: stage must attach to a live pipeline in this tenant.
    await this.getPipeline(ctx, input.pipelineId);
    const row = await crmRepo.insertStage(ctx, {
      id: "stg_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      pipelineId: input.pipelineId,
      name,
      sort: input.sort ?? 0,
      probability: input.probability ?? null,
      isWon: input.isWon ?? false,
      isLost: input.isLost ?? false,
    });
    await this.audit(ctx, "crm.stage.create", "pipeline_stage", row.id, {
      pipelineId: input.pipelineId,
      name,
    });
    return row;
  },

  async updateStage(
    ctx: TenantContext,
    id: string,
    input: UpdateStageInput,
  ): Promise<PipelineStageRow> {
    await this.getStage(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new ServiceError("Nama stage wajib diisi", 400, "validation");
      patch.name = name;
    }
    for (const f of ["sort", "probability", "isWon", "isLost"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await crmRepo.updateStage(ctx, id, patch);
    if (!row) throw new ServiceError("Stage tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "crm.stage.update", "pipeline_stage", id, { fields: Object.keys(patch) });
    return row;
  },

  async softDeleteStage(ctx: TenantContext, id: string): Promise<void> {
    const ok = await crmRepo.softDeleteStage(ctx, id);
    if (!ok) throw new ServiceError("Stage tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "crm.stage.delete", "pipeline_stage", id);
  },

  async restoreStage(ctx: TenantContext, id: string): Promise<PipelineStageRow> {
    const ok = await crmRepo.restoreStage(ctx, id);
    if (!ok) throw new ServiceError("Stage tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "crm.stage.restore", "pipeline_stage", id);
    return this.getStage(ctx, id);
  },

  async hardDeleteStage(ctx: TenantContext, id: string): Promise<void> {
    const ok = await crmRepo.hardDeleteStage(ctx, id);
    if (!ok) throw new ServiceError("Stage tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "crm.stage.purge", "pipeline_stage", id);
  },

  // ═══════════════════════ deal ═════════════════════════════════════
  async listDeals(
    ctx: TenantContext,
    filter?: { pipelineId?: string; stageId?: string; contactId?: string; workspaceId?: string },
  ): Promise<DealRow[]> {
    return crmRepo.listDeals(ctx, filter);
  },

  /** Keyset-paginated live deals (newest first) — the route's default read. */
  async pageDeals(
    ctx: TenantContext,
    filter?: { pipelineId?: string; stageId?: string; contactId?: string; workspaceId?: string },
    page?: PageParams,
  ): Promise<Page<DealRow>> {
    return crmRepo.pageDeals(ctx, filter, page);
  },

  async listTrashedDeals(ctx: TenantContext): Promise<DealRow[]> {
    return crmRepo.listTrashedDeals(ctx);
  },

  async getDeal(ctx: TenantContext, id: string): Promise<DealRow> {
    const row = await crmRepo.getDeal(ctx, id);
    if (!row) throw new ServiceError("Deal tidak ditemukan", 404, "not_found");
    return row;
  },

  async createDeal(ctx: TenantContext, input: CreateDealInput): Promise<DealRow> {
    const name = input.name?.trim();
    if (!name) throw new ServiceError("Nama deal wajib diisi", 400, "validation");
    const status = assertEnum(input.status, DEAL_STATUSES, "status");
    const value = input.value ?? 0;
    if (!Number.isFinite(value) || value < 0) {
      throw new ServiceError("value tidak valid", 400, "validation");
    }
    // Integrity: validate every soft ref against a live row in this tenant.
    if (input.pipelineId) await this.getPipeline(ctx, input.pipelineId);
    if (input.stageId) await this.assertStageInPipeline(ctx, input.stageId, input.pipelineId);
    if (input.contactId) await this.getContact(ctx, input.contactId);
    if (input.companyId) await this.getCompany(ctx, input.companyId);

    const row = await crmRepo.insertDeal(ctx, {
      id: "deal_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      name,
      pipelineId: input.pipelineId ?? null,
      stageId: input.stageId ?? null,
      contactId: input.contactId ?? null,
      companyId: input.companyId ?? null,
      workspaceId: input.workspaceId ?? null,
      productId: input.productId ?? null,
      value,
      currency: input.currency ?? "IDR",
      status,
      expectedClose: input.expectedClose ?? null,
      closedAt: status === "won" || status === "lost" ? new Date() : null,
      lostReason: input.lostReason ?? null,
      sourceChannel: input.sourceChannel ?? null,
      ownerUserId: input.ownerUserId ?? null,
    });
    await this.audit(ctx, "crm.deal.create", "deal", row.id, { name, value, status });
    return row;
  },

  async updateDeal(ctx: TenantContext, id: string, input: UpdateDealInput): Promise<DealRow> {
    const current = await this.getDeal(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new ServiceError("Nama deal wajib diisi", 400, "validation");
      patch.name = name;
    }
    if (input.value !== undefined) {
      if (!Number.isFinite(input.value) || input.value < 0) {
        throw new ServiceError("value tidak valid", 400, "validation");
      }
      patch.value = input.value;
    }
    if (input.status !== undefined) {
      const status = assertEnum(input.status, DEAL_STATUSES, "status");
      patch.status = status;
      // Stamp closed_at when transitioning to a terminal status; clear on reopen.
      if (status === "won" || status === "lost") {
        if (current.status === "open") patch.closedAt = new Date();
      } else {
        patch.closedAt = null;
      }
    }
    if (input.pipelineId !== undefined) {
      if (input.pipelineId) await this.getPipeline(ctx, input.pipelineId);
      patch.pipelineId = input.pipelineId;
    }
    if (input.stageId !== undefined) {
      if (input.stageId) {
        const effectivePipeline =
          input.pipelineId !== undefined ? input.pipelineId : current.pipelineId;
        await this.assertStageInPipeline(ctx, input.stageId, effectivePipeline);
      }
      patch.stageId = input.stageId;
    }
    if (input.contactId !== undefined) {
      if (input.contactId) await this.getContact(ctx, input.contactId);
      patch.contactId = input.contactId;
    }
    if (input.companyId !== undefined) {
      if (input.companyId) await this.getCompany(ctx, input.companyId);
      patch.companyId = input.companyId;
    }
    for (const f of [
      "workspaceId",
      "productId",
      "currency",
      "expectedClose",
      "lostReason",
      "sourceChannel",
      "ownerUserId",
    ] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await crmRepo.updateDeal(ctx, id, patch);
    if (!row) throw new ServiceError("Deal tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "crm.deal.update", "deal", id, { fields: Object.keys(patch) });
    return row;
  },

  async softDeleteDeal(ctx: TenantContext, id: string): Promise<void> {
    const ok = await crmRepo.softDeleteDeal(ctx, id);
    if (!ok) throw new ServiceError("Deal tidak ditemukan", 404, "not_found");
    await this.cascadeSubjectActivitiesDeleted(ctx, "deal", id, true);
    await this.audit(ctx, "crm.deal.delete", "deal", id);
  },

  async restoreDeal(ctx: TenantContext, id: string): Promise<DealRow> {
    const ok = await crmRepo.restoreDeal(ctx, id);
    if (!ok) throw new ServiceError("Deal tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "crm.deal.restore", "deal", id);
    return this.getDeal(ctx, id);
  },

  async hardDeleteDeal(ctx: TenantContext, id: string): Promise<void> {
    const ok = await crmRepo.hardDeleteDeal(ctx, id);
    if (!ok) throw new ServiceError("Deal tidak ditemukan", 404, "not_found");
    await this.cascadeSubjectActivitiesHard(ctx, "deal", id);
    await this.audit(ctx, "crm.deal.purge", "deal", id);
  },

  // ═══════════════════════ activity ═════════════════════════════════
  async listActivities(
    ctx: TenantContext,
    filter?: { subjectType?: string; subjectId?: string },
  ): Promise<ActivityRow[]> {
    return crmRepo.listActivities(ctx, filter);
  },

  async listTrashedActivities(ctx: TenantContext): Promise<ActivityRow[]> {
    return crmRepo.listTrashedActivities(ctx);
  },

  async getActivity(ctx: TenantContext, id: string): Promise<ActivityRow> {
    const row = await crmRepo.getActivity(ctx, id);
    if (!row) throw new ServiceError("Aktivitas tidak ditemukan", 404, "not_found");
    return row;
  },

  async createActivity(ctx: TenantContext, input: CreateActivityInput): Promise<ActivityRow> {
    const subjectType = assertEnum(input.subjectType, ACTIVITY_SUBJECTS, "subject_type");
    const subjectId = input.subjectId?.trim();
    if (!subjectId) throw new ServiceError("subject_id wajib diisi", 400, "validation");
    const type = assertEnum(input.type, ACTIVITY_TYPES, "type");
    // Integrity: the subject must be a live row of its type in this tenant.
    await this.assertSubjectExists(ctx, subjectType, subjectId);

    const row = await crmRepo.insertActivity(ctx, {
      id: "act_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      subjectType,
      subjectId,
      type,
      title: input.title ?? null,
      body: input.body ?? null,
      dueAt: parseDate(input.dueAt, "due_at"),
      doneAt: parseDate(input.doneAt, "done_at"),
      actorUserId: input.actorUserId ?? ctx.userId,
      meta: input.meta ?? null,
    });
    // Touch the subject's last_activity_at when it's a contact.
    if (subjectType === "contact") {
      await crmRepo.updateContact(ctx, subjectId, { lastActivityAt: new Date() });
    }
    await this.audit(ctx, "crm.activity.create", "activity", row.id, { subjectType, subjectId, type });
    return row;
  },

  async updateActivity(
    ctx: TenantContext,
    id: string,
    input: UpdateActivityInput,
  ): Promise<ActivityRow> {
    await this.getActivity(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.type !== undefined) patch.type = assertEnum(input.type, ACTIVITY_TYPES, "type");
    if (input.dueAt !== undefined) patch.dueAt = parseDate(input.dueAt, "due_at");
    if (input.doneAt !== undefined) patch.doneAt = parseDate(input.doneAt, "done_at");
    for (const f of ["title", "body", "actorUserId", "meta"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await crmRepo.updateActivity(ctx, id, patch);
    if (!row) throw new ServiceError("Aktivitas tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "crm.activity.update", "activity", id, { fields: Object.keys(patch) });
    return row;
  },

  async softDeleteActivity(ctx: TenantContext, id: string): Promise<void> {
    const ok = await crmRepo.softDeleteActivity(ctx, id);
    if (!ok) throw new ServiceError("Aktivitas tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "crm.activity.delete", "activity", id);
  },

  async restoreActivity(ctx: TenantContext, id: string): Promise<ActivityRow> {
    const ok = await crmRepo.restoreActivity(ctx, id);
    if (!ok) throw new ServiceError("Aktivitas tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "crm.activity.restore", "activity", id);
    return this.getActivity(ctx, id);
  },

  async hardDeleteActivity(ctx: TenantContext, id: string): Promise<void> {
    const ok = await crmRepo.hardDeleteActivity(ctx, id);
    if (!ok) throw new ServiceError("Aktivitas tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "crm.activity.purge", "activity", id);
  },

  // ═══════════════════════ internal helpers ═════════════════════════
  /** A stage must belong to the deal's pipeline (when both are given). */
  async assertStageInPipeline(
    ctx: TenantContext,
    stageId: string,
    pipelineId: string | null | undefined,
  ): Promise<void> {
    const stage = await crmRepo.getStage(ctx, stageId);
    if (!stage) throw new ServiceError("Stage tidak ditemukan", 400, "invalid_stage");
    if (pipelineId && stage.pipelineId !== pipelineId) {
      throw new ServiceError("Stage bukan milik pipeline ini", 400, "stage_pipeline_mismatch");
    }
  },

  /** The polymorphic subject of an activity must be a live row of its type. */
  async assertSubjectExists(
    ctx: TenantContext,
    subjectType: string,
    subjectId: string,
  ): Promise<void> {
    const exists =
      subjectType === "contact"
        ? await crmRepo.getContact(ctx, subjectId)
        : subjectType === "company"
          ? await crmRepo.getCompany(ctx, subjectId)
          : await crmRepo.getDeal(ctx, subjectId);
    if (!exists) {
      throw new ServiceError(`${subjectType} subjek tidak ditemukan`, 400, "invalid_subject");
    }
  },

  /** Soft-delete/restore every activity on a subject (set-based cascade). */
  async cascadeSubjectActivitiesDeleted(
    ctx: TenantContext,
    subjectType: string,
    subjectId: string,
    deleted: boolean,
  ): Promise<void> {
    await crmRepo.setActivitiesDeletedBySubject(ctx, subjectType, subjectId, deleted);
  },

  /** Permanently delete every activity on a subject (set-based purge cascade). */
  async cascadeSubjectActivitiesHard(
    ctx: TenantContext,
    subjectType: string,
    subjectId: string,
  ): Promise<void> {
    await crmRepo.hardDeleteActivitiesBySubject(ctx, subjectType, subjectId);
  },

  /** Write a tenant-scoped audit row for a CRM mutation. */
  async audit(
    ctx: TenantContext,
    action: string,
    targetType: string,
    targetId: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action,
      targetType,
      targetId,
      meta: meta ?? null,
    });
  },
};
