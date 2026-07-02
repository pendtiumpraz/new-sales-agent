import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { notificationService } from "@/modules/notification/service";
import { crmService } from "@/modules/crm/service";
import { crmRepo } from "@/modules/crm/repo";
import { tenantService } from "@/modules/tenant/service";
import { taxonomyService } from "@/modules/taxonomy/service";
import type { CompanyRow, ContactRow } from "@/modules/crm/schema";
import { enrichmentRepo } from "./repo";
import { planDiscoveryChannels, type DiscoveryPlan, type PlanInput } from "./plan";
import type {
  DiscoveryJobRow,
  DiscoveryResultRow,
  EnrichmentRecordRow,
} from "./schema";

/**
 * enrichment / discovery domain service — business logic + validation +
 * cross-module side effects (audit) + app-level cascade. Routes stay thin:
 * parse → call a method → wrap with the {ok,error} envelope.
 *
 * Owns three tables (discovery_job, discovery_result, enrichment_record).
 * Referential integrity is enforced HERE (app layer), never via DB FKs (none
 * exist): a result's `job_id` is validated against a live job; an enrichment
 * record's `contact_id` against a live CRM contact (through `crmService`, the
 * OWNING module — modular-monolith rule: never reach into another module's
 * tables). Soft-delete/restore/purge of a job CASCADES to its results.
 *
 * THE FLOW this module implements:
 *   1. DISCOVERY  — `runDiscovery` creates a `discovery_job` and persists the raw
 *                   leads it found as `discovery_result` rows (results_count rollup).
 *   2. SAVE       — `saveResultToWorkspace` pins a raw result to a workspace and
 *                   QUEUES an `enrichment_record` for it (status=queued).
 *   3. ENRICH     — `queueEnrichment` / `runEnrichment` fill the record's `fields`
 *                   (status queued → running → enriched).
 *   4. CLASSIFY   — `classifyRecord` decides B2C/B2B + a `fit_score` (heuristic
 *                   now; AI later in M6) → writes `classification`/`fit_score`.
 *   5. PUSH       — `pushRecordToContact` creates/updates a CRM `contact` via
 *                   `crmService`, setting its `segment` + `enrichment_status` +
 *                   `fit_score`, and stamps `pushed_contact_id` on the record.
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo
 * scopes all reads/writes to `ctx.tenantId` inside `withTenant`. Jobs/results are
 * additionally scoped by `workspace_id` in-app (no FK).
 */

// CHANNEL-NEUTRAL set: discovery can flow from ANY of these channels — none is
// the default. `web`/`directory` are generic; the rest are named platforms the
// extension RPA scrapes in a later phase (backend stays channel-agnostic now).
const CHANNELS = [
  "web",
  "linkedin",
  "google_maps",
  "google",
  "instagram",
  "facebook",
  "marketplace",
  "shopee",
  "tokopedia",
  "tiktok",
  "directory",
  "manual",
] as const;
const POSTURES = ["compliant", "balanced", "aggressive"] as const;
const ORIGINS = ["manual", "mcp", "extension"] as const;
const JOB_STATUSES = ["pending", "running", "done", "error"] as const;
const RECORD_STATUSES = ["queued", "running", "enriched", "failed"] as const;
const CLASSIFICATIONS = ["b2c", "b2b", "unknown"] as const;

// ── input shapes ─────────────────────────────────────────────────────────────
export interface DiscoveryResultInput {
  fullName?: string | null;
  companyName?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  location?: string | null;
  website?: string | null;
  socials?: Record<string, string> | null;
  snippet?: string | null;
  sourceUrl?: string | null;
  raw?: Record<string, unknown> | null;
}

export interface RunDiscoveryInput {
  query: string;
  workspaceId?: string | null;
  channel?: string; // web|linkedin|instagram|maps|directory
  source?: string | null;
  posture?: string; // compliant|balanced|aggressive
  origin?: string; // manual|mcp|extension
  /** Raw leads the caller's RPA/extension/connector already extracted for this run. */
  results?: DiscoveryResultInput[];
}

export interface SaveResultInput {
  workspaceId?: string | null; // overrides the result/job workspace if given
}

export interface QueueEnrichmentInput {
  contactId?: string | null; // enrich an existing CRM contact …
  resultId?: string | null; // … or a saved discovery result
  workspaceId?: string | null;
  source?: string | null;
}

export interface RunEnrichmentInput {
  /** Fields the caller's connector filled (merged into the record). */
  fields?: Record<string, unknown> | null;
  source?: string | null;
}

export interface ClassifyInput {
  /** Optional explicit override of the heuristic (manual reclassify). */
  classification?: string; // b2c|b2b|unknown
  fitScore?: number | null;
  fitReason?: string | null;
}

export interface PushToContactInput {
  workspaceId?: string | null; // workspace the new/updated contact belongs to
  ownerUserId?: string | null; // assigned rep (defaults to the caller)
}

// ── channel-agnostic Company→People graph ingest ─────────────────────────────
/**
 * A Company node the extension extracted from ANY channel. `phone`/`email`/
 * `address` are captured company-level handles — `company_v2` has no first-class
 * columns for them, so they are persisted in the company `socials` jsonb under
 * `phone`/`email`/`address` keys (real + queryable, no schema churn).
 */
export interface IngestCompanyInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  domain?: string | null;
  address?: string | null;
  industry?: string | null; // free-text label (as captured); classify resolves industry_id
  size?: string | null; // headcount band (as captured)
  summary?: string | null;
}

/** A Person node the extension extracted; `companyRef` links it to a graph company. */
export interface IngestPersonInput {
  fullName: string;
  title?: string | null;
  department?: string | null;
  seniority?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  location?: string | null;
  summary?: string | null; // profile summary / about (crawled/enriched)
  channelProfileUrl?: string | null; // the person's profile/handle URL on this channel
  socials?: Record<string, string> | null;
  /** Links to an IngestCompanyInput by `name` or `domain` (graph edge). */
  companyRef?: { name?: string | null; domain?: string | null } | null;
  // Pre-classification carried by the caller (the extension is the primary
  // analyzer). Only set when actually classified — an unclassified person leaves
  // these undefined so a re-crawl never clobbers a prior analysis.
  segment?: string | null; // b2c|b2b|unknown
  fitScore?: number | null; // 0..1
  fitReason?: string | null;
  /** Per-person provenance override (else the batch source is stamped). */
  source?: string | null;
  /**
   * Enrichment stage for merge semantics:
   *   true  (Stage 2 enriched) → the payload OVERWRITES existing fields.
   *   false (Stage 1 pending)  → the payload only FILLS NULLS (never clobbers).
   *   undefined                → default OVERWRITE (web-discovery re-ingest).
   * Also drives the contact's `enrichment_status` (enriched/pending) on create.
   */
  enriched?: boolean;
}

/**
 * One channel-agnostic ingest of a Company→People graph. `channel` + `sourceUrl`
 * are stamped on EVERY node (provenance). `analyze` opts into taxonomy
 * classify-on-ingest (industry for companies, occupation for people).
 */
export interface IngestGraphInput {
  channel: string; // linkedin|google_maps|instagram|… (channel-neutral)
  sourceUrl?: string | null;
  workspaceId?: string | null;
  ownerUserId?: string | null; // assigned rep (per-rep attribution)
  origin?: string; // manual|mcp|extension
  posture?: string;
  companies?: IngestCompanyInput[];
  people?: IngestPersonInput[];
  /** When true, run taxonomy classify on each ingested company/person. */
  analyze?: boolean;
}

/** A contact touched (created or updated) by an ingest — enough for a caller to
 *  route it to a downstream classifier (Fase 3 BYOA classify) without a re-query. */
export interface IngestGraphContactRef {
  id: string;
  fullName: string;
  title: string | null;
  companyName: string | null;
  segment: string | null;
  isNew: boolean;
}

export interface IngestGraphResult {
  companiesUpserted: number;
  peopleUpserted: number;
  companiesClassified: number;
  peopleClassified: number;
  jobId: string;
  /** Every contact touched in this batch (created/updated), for downstream routing
   *  (e.g. enqueue a BYOA `classify` agent_task per new/unclassified contact). */
  contacts: IngestGraphContactRef[];
}

// ── validation helpers ───────────────────────────────────────────────────────
function assertEnum(value: string | undefined, allowed: readonly string[], field: string): string {
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

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ── classify heuristic (B2C/B2B + fit_score) ─────────────────────────────────
// Deterministic, offline heuristic — the AI classifier lands in M6. b2b is
// implied by a business identity (a company + a job title / business email /
// professional social); b2c by a bare personal handle. fit_score rewards how much
// actionable, on-channel signal the profile carries.
export interface ClassifySignals {
  companyName?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  socials?: Record<string, string> | null;
}

const FREE_EMAIL = /@(gmail|yahoo|ymail|hotmail|outlook|icloud|proton(mail)?|aol)\./i;

/**
 * Offline B2C/B2B + fit_score heuristic (no AI, deterministic). Exported so the
 * extension-crawl ingest route can reuse THIS rebuild classifier as its server-side
 * FALLBACK for enriched-but-unclassified leads (replacing the legacy `classifyLead`
 * that wrote the orphaned `person` table).
 */
export function classifySignals(s: ClassifySignals): {
  classification: (typeof CLASSIFICATIONS)[number];
  fitScore: number;
  fitReason: string;
} {
  const reasons: string[] = [];
  let b2bScore = 0;
  let b2cScore = 0;

  const hasCompany = Boolean(s.companyName?.trim());
  const hasTitle = Boolean(s.title?.trim());
  const email = s.email?.trim() ?? "";
  const businessEmail = Boolean(email) && !FREE_EMAIL.test(email);
  const freeEmail = Boolean(email) && FREE_EMAIL.test(email);
  const hasLinkedin = Boolean(s.socials?.linkedin);
  const hasInstagram = Boolean(s.socials?.instagram);
  const hasWhatsapp = Boolean(s.whatsapp?.trim());

  if (hasCompany) {
    b2bScore += 2;
    reasons.push("punya perusahaan");
  }
  if (hasTitle) {
    b2bScore += 2;
    reasons.push("punya jabatan");
  }
  if (businessEmail) {
    b2bScore += 2;
    reasons.push("email domain bisnis");
  }
  if (hasLinkedin) {
    b2bScore += 1;
    reasons.push("ada LinkedIn");
  }
  if (freeEmail) {
    b2cScore += 1;
    reasons.push("email pribadi");
  }
  if (hasInstagram && !hasLinkedin) {
    b2cScore += 1;
    reasons.push("hanya Instagram");
  }
  if (hasWhatsapp && !hasCompany && !hasTitle) {
    b2cScore += 1;
    reasons.push("WA personal");
  }

  let classification: (typeof CLASSIFICATIONS)[number];
  if (b2bScore === 0 && b2cScore === 0) classification = "unknown";
  else if (b2bScore >= b2cScore) classification = "b2b";
  else classification = "b2c";

  // fit_score: contactability + identity completeness, normalized to 0..1.
  let fit = 0;
  if (businessEmail) fit += 0.3;
  else if (freeEmail) fit += 0.15;
  if (hasWhatsapp || s.phone?.trim()) fit += 0.2;
  if (hasTitle) fit += 0.15;
  if (hasCompany) fit += 0.15;
  if (hasLinkedin) fit += 0.1;
  if (hasInstagram) fit += 0.05;
  const fitScore = clamp01(Number(fit.toFixed(2)));

  const fitReason = reasons.length
    ? `Heuristik: ${reasons.join(", ")}.`
    : "Heuristik: sinyal tidak cukup untuk klasifikasi.";
  return { classification, fitScore, fitReason };
}

export const enrichmentService = {
  // ═══════════════════════ discovery_job ════════════════════════════
  async listJobs(
    ctx: TenantContext,
    filter?: { workspaceId?: string; channel?: string; status?: string },
  ): Promise<DiscoveryJobRow[]> {
    return enrichmentRepo.listJobs(ctx, filter);
  },

  async listTrashedJobs(ctx: TenantContext): Promise<DiscoveryJobRow[]> {
    return enrichmentRepo.listTrashedJobs(ctx);
  },

  async getJob(ctx: TenantContext, id: string): Promise<DiscoveryJobRow> {
    const row = await enrichmentRepo.getJob(ctx, id);
    if (!row) throw new ServiceError("Job discovery tidak ditemukan", 404, "not_found");
    return row;
  },

  /**
   * Run a discovery search: create the job, persist the raw leads the caller's
   * connector found as `discovery_result` rows, and roll up `results_count`. The
   * actual web fetch happens in the caller (RPA/extension/connector) and is passed
   * in as `results` — this service is the persistence + lifecycle owner, mirroring
   * the synchronous prototype (no background worker).
   */
  async runDiscovery(ctx: TenantContext, input: RunDiscoveryInput): Promise<{
    job: DiscoveryJobRow;
    results: DiscoveryResultRow[];
  }> {
    const query = input.query?.trim();
    if (!query) throw new ServiceError("query wajib diisi", 400, "validation");
    const channel = assertEnum(input.channel, CHANNELS, "channel");
    const posture = assertEnum(input.posture, POSTURES, "posture");
    const origin = input.origin ? assertEnum(input.origin, ORIGINS, "origin") : "manual";

    // Record the job as running BEFORE persisting results so a crash still leaves
    // a history row (mirrors the legacy crawl_job behaviour).
    const job = await enrichmentRepo.insertJob(ctx, {
      id: "dsj_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      workspaceId: input.workspaceId ?? null,
      query,
      channel,
      source: input.source ?? null,
      status: "running",
      posture,
      origin,
      startedAt: new Date(),
    });

    let results: DiscoveryResultRow[] = [];
    try {
      // Batch every found lead into ONE insert (audit #32 — was a per-row loop).
      const rows = (input.results ?? []).map((r) => ({
        id: "dsr_" + crypto.randomUUID(),
        tenantId: ctx.tenantId,
        jobId: job.id,
        workspaceId: input.workspaceId ?? null,
        fullName: r.fullName ?? null,
        companyName: r.companyName ?? null,
        title: r.title ?? null,
        email: r.email ?? null,
        phone: r.phone ?? null,
        whatsapp: r.whatsapp ?? null,
        location: r.location ?? null,
        website: r.website ?? null,
        socials: r.socials ?? null,
        snippet: r.snippet ?? null,
        sourceUrl: r.sourceUrl ?? null,
        raw: r.raw ?? null,
      }));
      results = await enrichmentRepo.insertResults(ctx, rows);
      const finished = await enrichmentRepo.updateJob(ctx, job.id, {
        status: "done",
        resultsCount: results.length,
        finishedAt: new Date(),
      });
      await this.audit(ctx, "enrichment.discovery.run", "discovery_job", job.id, {
        query,
        channel,
        resultsCount: results.length,
      });
      return { job: finished ?? job, results };
    } catch (err) {
      await enrichmentRepo
        .updateJob(ctx, job.id, { status: "error", error: String(err), finishedAt: new Date() })
        .catch(() => {});
      throw err;
    }
  },

  async softDeleteJob(ctx: TenantContext, id: string): Promise<void> {
    const ok = await enrichmentRepo.softDeleteJob(ctx, id);
    if (!ok) throw new ServiceError("Job discovery tidak ditemukan", 404, "not_found");
    // App-level cascade: trash the job's results alongside it.
    await enrichmentRepo.setResultsDeletedByJob(ctx, [id], true);
    await this.audit(ctx, "enrichment.discovery.delete", "discovery_job", id);
  },

  async restoreJob(ctx: TenantContext, id: string): Promise<DiscoveryJobRow> {
    const ok = await enrichmentRepo.restoreJob(ctx, id);
    if (!ok) throw new ServiceError("Job discovery tidak ada di trash", 404, "not_found");
    await enrichmentRepo.setResultsDeletedByJob(ctx, [id], false);
    await this.audit(ctx, "enrichment.discovery.restore", "discovery_job", id);
    return this.getJob(ctx, id);
  },

  async hardDeleteJob(ctx: TenantContext, id: string): Promise<void> {
    const ok = await enrichmentRepo.hardDeleteJob(ctx, id);
    if (!ok) throw new ServiceError("Job discovery tidak ditemukan", 404, "not_found");
    await enrichmentRepo.hardDeleteResultsByJob(ctx, id);
    await this.audit(ctx, "enrichment.discovery.purge", "discovery_job", id);
  },

  // ═══════════════════════ discovery_result ═════════════════════════
  async listResults(
    ctx: TenantContext,
    filter?: { jobId?: string; workspaceId?: string; savedOnly?: boolean },
  ): Promise<DiscoveryResultRow[]> {
    return enrichmentRepo.listResults(ctx, filter);
  },

  async listTrashedResults(ctx: TenantContext): Promise<DiscoveryResultRow[]> {
    return enrichmentRepo.listTrashedResults(ctx);
  },

  async getResult(ctx: TenantContext, id: string): Promise<DiscoveryResultRow> {
    const row = await enrichmentRepo.getResult(ctx, id);
    if (!row) throw new ServiceError("Hasil discovery tidak ditemukan", 404, "not_found");
    return row;
  },

  /**
   * Save a raw discovery result into a workspace: stamp `saved_at` + the
   * workspace, then QUEUE an enrichment record for it (the enrich pipeline picks
   * it up). Idempotent — re-saving returns the existing queued record.
   */
  async saveResultToWorkspace(
    ctx: TenantContext,
    resultId: string,
    input?: SaveResultInput,
  ): Promise<{ result: DiscoveryResultRow; record: EnrichmentRecordRow }> {
    const result = await this.getResult(ctx, resultId);
    const workspaceId = input?.workspaceId ?? result.workspaceId ?? null;
    const saved = await enrichmentRepo.updateResult(ctx, resultId, {
      savedAt: result.savedAt ?? new Date(),
      workspaceId,
    });
    if (!saved) throw new ServiceError("Hasil discovery tidak ditemukan", 404, "not_found");

    const record = await this.queueEnrichment(ctx, {
      resultId,
      workspaceId,
      source: result.sourceUrl ?? "discovery",
    });
    await this.audit(ctx, "enrichment.result.save", "discovery_result", resultId, {
      workspaceId,
      recordId: record.id,
    });
    return { result: saved, record };
  },

  async softDeleteResult(ctx: TenantContext, id: string): Promise<void> {
    const ok = await enrichmentRepo.softDeleteResult(ctx, id);
    if (!ok) throw new ServiceError("Hasil discovery tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "enrichment.result.delete", "discovery_result", id);
  },

  async restoreResult(ctx: TenantContext, id: string): Promise<DiscoveryResultRow> {
    const ok = await enrichmentRepo.restoreResult(ctx, id);
    if (!ok) throw new ServiceError("Hasil discovery tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "enrichment.result.restore", "discovery_result", id);
    return this.getResult(ctx, id);
  },

  async hardDeleteResult(ctx: TenantContext, id: string): Promise<void> {
    const ok = await enrichmentRepo.hardDeleteResult(ctx, id);
    if (!ok) throw new ServiceError("Hasil discovery tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "enrichment.result.purge", "discovery_result", id);
  },

  // ═══════════════════════ enrichment_record ════════════════════════
  async listRecords(
    ctx: TenantContext,
    filter?: { contactId?: string; workspaceId?: string; status?: string },
  ): Promise<EnrichmentRecordRow[]> {
    return enrichmentRepo.listRecords(ctx, filter);
  },

  async listTrashedRecords(ctx: TenantContext): Promise<EnrichmentRecordRow[]> {
    return enrichmentRepo.listTrashedRecords(ctx);
  },

  async getRecord(ctx: TenantContext, id: string): Promise<EnrichmentRecordRow> {
    const row = await enrichmentRepo.getRecord(ctx, id);
    if (!row) throw new ServiceError("Record enrichment tidak ditemukan", 404, "not_found");
    return row;
  },

  /**
   * QUEUE an enrichment record. Subject is EITHER an existing CRM `contact`
   * (`contactId`) or a saved discovery `result` (`resultId`). For a contact, the
   * queue is idempotent (one live record per contact) and also flips the CRM
   * contact's `enrichment_status` to `pending`.
   */
  async queueEnrichment(
    ctx: TenantContext,
    input: QueueEnrichmentInput,
  ): Promise<EnrichmentRecordRow> {
    const contactId = input.contactId?.trim() || null;
    const resultId = input.resultId?.trim() || null;
    if (!contactId && !resultId) {
      throw new ServiceError("contact_id atau result_id wajib diisi", 400, "validation");
    }

    let workspaceId = input.workspaceId ?? null;
    const fields: Record<string, unknown> = {};

    if (contactId) {
      // Integrity: must be a live contact in this tenant (OWNING module: crm).
      const contact = await crmService.getContact(ctx, contactId);
      workspaceId = workspaceId ?? contact.workspaceId ?? null;
      // Idempotent: reuse the existing live record for this contact if present.
      const existing = await enrichmentRepo.getRecordByContact(ctx, contactId);
      if (existing) return existing;
      // Mark the CRM contact as pending enrichment.
      await crmService.updateContact(ctx, contactId, { enrichmentStatus: "pending" });
    }

    if (resultId) {
      // Integrity: must be a live result; seed the queue with its raw fields.
      const result = await this.getResult(ctx, resultId);
      workspaceId = workspaceId ?? result.workspaceId ?? null;
      Object.assign(fields, this.fieldsFromResult(result));
    }

    const record = await enrichmentRepo.insertRecord(ctx, {
      id: "enr_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      contactId,
      workspaceId,
      resultId,
      fields,
      source: input.source ?? null,
      status: "queued",
    });
    await this.audit(ctx, "enrichment.record.queue", "enrichment_record", record.id, {
      contactId,
      resultId,
    });
    return record;
  },

  /**
   * RUN enrichment on a queued record: merge the connector-filled `fields`, flip
   * status queued/failed → running → enriched, and (if the record targets a CRM
   * contact) flip the contact's `enrichment_status` to `enriched`. The actual
   * fetch happens in the caller; this owns the merge + lifecycle.
   */
  async runEnrichment(
    ctx: TenantContext,
    id: string,
    input?: RunEnrichmentInput,
  ): Promise<EnrichmentRecordRow> {
    const record = await this.getRecord(ctx, id);
    if (record.status === "running") {
      // running is transient; let it proceed (idempotent re-run).
    }
    await enrichmentRepo.updateRecord(ctx, id, { status: "running" });

    const merged: Record<string, unknown> = { ...(record.fields ?? {}), ...(input?.fields ?? {}) };
    const updated = await enrichmentRepo.updateRecord(ctx, id, {
      fields: merged,
      source: input?.source ?? record.source,
      status: "enriched",
      error: null,
      enrichedAt: new Date(),
    });
    if (!updated) throw new ServiceError("Record enrichment tidak ditemukan", 404, "not_found");

    if (record.contactId) {
      await crmService
        .updateContact(ctx, record.contactId, { enrichmentStatus: "enriched" })
        .catch(() => {});
      // CLASSIFY-ON-ENRICH: resolve the taxonomy occupation (person) + industry
      // (its company) from the now-enriched fields and store the ids on CRM.
      // Best-effort + non-throwing: a $0-credit / no-key tenant just skips this
      // (taxonomy.classify already degrades to unclassified, never "token habis").
      await this.classifyContactTaxonomy(ctx, record.contactId).catch((e) => {
        console.error("[enrichment classify-on-enrich]", record.contactId, e);
      });
    }
    await this.audit(ctx, "enrichment.record.run", "enrichment_record", id, {
      fields: Object.keys(merged),
    });
    return updated;
  },

  /**
   * CLASSIFY a record: decide B2C/B2B + fit_score. Default is the offline
   * heuristic over the record's fields/result; the caller may override
   * `classification`/`fit_score`/`fit_reason` (manual reclassify). Writes back to
   * the CRM contact's `segment`/`fit_score` when the record targets one.
   */
  async classifyRecord(
    ctx: TenantContext,
    id: string,
    input?: ClassifyInput,
  ): Promise<EnrichmentRecordRow> {
    const record = await this.getRecord(ctx, id);

    let classification: (typeof CLASSIFICATIONS)[number];
    let fitScore: number | null;
    let fitReason: string;

    if (input?.classification !== undefined || input?.fitScore !== undefined) {
      // Manual override path.
      classification = assertEnum(
        input.classification,
        CLASSIFICATIONS,
        "classification",
      ) as (typeof CLASSIFICATIONS)[number];
      fitScore = assertFitScore(input.fitScore);
      fitReason = input.fitReason ?? "Klasifikasi manual.";
    } else {
      // Heuristic path: derive signals from the record fields (+ its result).
      const signals = await this.signalsForRecord(ctx, record);
      const out = classifySignals(signals);
      classification = out.classification;
      fitScore = out.fitScore;
      fitReason = out.fitReason;
    }

    const updated = await enrichmentRepo.updateRecord(ctx, id, {
      classification,
      fitScore,
      fitReason,
      classifiedAt: new Date(),
    });
    if (!updated) throw new ServiceError("Record enrichment tidak ditemukan", 404, "not_found");

    // Mirror the classification onto the CRM contact (segment + fit_score).
    if (record.contactId) {
      await crmService
        .updateContact(ctx, record.contactId, {
          segment: classification,
          fitScore,
          fitReason,
        })
        .catch(() => {});
    }
    await this.audit(ctx, "enrichment.record.classify", "enrichment_record", id, {
      classification,
      fitScore,
    });
    return updated;
  },

  /**
   * PUSH an enriched record to a CRM contact. If the record already targets a
   * contact (`contactId`), UPDATE it; otherwise CREATE a new contact from the
   * record's fields (+ originating discovery result). Either way the CRM contact's
   * `segment` + `enrichment_status` + `fit_score` are set from the record, and
   * `pushed_contact_id`/`pushed_at` are stamped on the record.
   */
  async pushRecordToContact(
    ctx: TenantContext,
    id: string,
    input?: PushToContactInput,
  ): Promise<{ record: EnrichmentRecordRow; contactId: string }> {
    const record = await this.getRecord(ctx, id);
    const f = (record.fields ?? {}) as Record<string, unknown>;
    const result = record.resultId
      ? await enrichmentRepo.getResult(ctx, record.resultId)
      : undefined;

    const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
    const fullName =
      str(f.fullName) ?? result?.fullName ?? str(f.name) ?? record.contactId ?? "Lead tanpa nama";
    const workspaceId = input?.workspaceId ?? record.workspaceId ?? result?.workspaceId ?? null;
    const segment = CLASSIFICATIONS.includes(record.classification as (typeof CLASSIFICATIONS)[number])
      ? record.classification
      : "unknown";

    let contactId: string;
    if (record.contactId) {
      // Update the existing contact with the enriched profile + classification.
      const contact = await crmService.updateContact(ctx, record.contactId, {
        fullName,
        companyId: str(f.companyId) ?? undefined,
        title: str(f.title) ?? result?.title ?? undefined,
        email: str(f.email) ?? result?.email ?? undefined,
        phone: str(f.phone) ?? result?.phone ?? undefined,
        whatsapp: str(f.whatsapp) ?? result?.whatsapp ?? undefined,
        location: str(f.location) ?? result?.location ?? undefined,
        socials: (f.socials as Record<string, string> | undefined) ?? result?.socials ?? undefined,
        workspaceId: workspaceId ?? undefined,
        segment,
        enrichmentStatus: "enriched",
        fitScore: record.fitScore ?? undefined,
        fitReason: record.fitReason ?? undefined,
        source: record.source ?? undefined,
      });
      contactId = contact.id;
    } else {
      // Create a fresh CRM contact from the enriched record.
      const contact = await crmService.createContact(ctx, {
        fullName,
        workspaceId,
        title: str(f.title) ?? result?.title ?? null,
        email: str(f.email) ?? result?.email ?? null,
        phone: str(f.phone) ?? result?.phone ?? null,
        whatsapp: str(f.whatsapp) ?? result?.whatsapp ?? null,
        location: str(f.location) ?? result?.location ?? null,
        socials: (f.socials as Record<string, string> | null) ?? result?.socials ?? null,
        segment,
        enrichmentStatus: "enriched",
        fitScore: record.fitScore,
        fitReason: record.fitReason,
        ownerUserId: input?.ownerUserId ?? ctx.userId,
        source: record.source ?? "enrichment",
      });
      contactId = contact.id;
    }

    const updated = await enrichmentRepo.updateRecord(ctx, id, {
      contactId,
      pushedContactId: contactId,
      pushedAt: new Date(),
    });
    // Link the originating discovery result to the created contact.
    if (record.resultId) {
      await enrichmentRepo
        .updateResult(ctx, record.resultId, { savedContactId: contactId })
        .catch(() => {});
    }
    // CLASSIFY-ON-ENRICH: the contact (and its company) now exist in CRM — resolve
    // + store the taxonomy occupation_id / industry_id. Best-effort, non-throwing.
    await this.classifyContactTaxonomy(ctx, contactId).catch((e) => {
      console.error("[enrichment classify-on-push]", contactId, e);
    });

    await this.audit(ctx, "enrichment.record.push", "enrichment_record", id, {
      contactId,
      segment,
      fitScore: record.fitScore,
    });
    return { record: updated ?? record, contactId };
  },

  async softDeleteRecord(ctx: TenantContext, id: string): Promise<void> {
    const ok = await enrichmentRepo.softDeleteRecord(ctx, id);
    if (!ok) throw new ServiceError("Record enrichment tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "enrichment.record.delete", "enrichment_record", id);
  },

  async restoreRecord(ctx: TenantContext, id: string): Promise<EnrichmentRecordRow> {
    const ok = await enrichmentRepo.restoreRecord(ctx, id);
    if (!ok) throw new ServiceError("Record enrichment tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "enrichment.record.restore", "enrichment_record", id);
    return this.getRecord(ctx, id);
  },

  async hardDeleteRecord(ctx: TenantContext, id: string): Promise<void> {
    const ok = await enrichmentRepo.hardDeleteRecord(ctx, id);
    if (!ok) throw new ServiceError("Record enrichment tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "enrichment.record.purge", "enrichment_record", id);
  },

  // ═══════════════════════ cross-channel plan ═══════════════════════
  /**
   * Build a CROSS-CHANNEL discovery plan (LinkedIn + Google Maps + dorks +
   * Instagram/Facebook/marketplace/TikTok + channel-agnostic roles/industries/
   * companies/keywords). Channel-NEUTRAL — no channel is the default. Metered AI
   * with a JSON contract; degrades to a heuristic plan on any failure (so $0
   * credit never surfaces "token habis"). The real people come from the extension
   * / crawl + `ingestGraph`, not from this plan.
   */
  async planDiscoveryChannels(ctx: TenantContext, input: PlanInput): Promise<DiscoveryPlan> {
    if (!input.field?.trim()) {
      throw new ServiceError("Bidang/pekerjaan wajib diisi", 400, "validation");
    }
    return planDiscoveryChannels(ctx, input);
  },

  // ═══════════════ channel-agnostic Company→People graph ingest ═════════════
  /**
   * Ingest a Company→People GRAPH extracted by the extension from ANY channel.
   * Upserts company nodes (`company_v2`) + person nodes (`contact`) into CRM via
   * the OWNING module (`crmService` — modular-monolith rule, no cross-table reach),
   * stamping `channel` + `sourceUrl` (provenance / `source`) on every node and
   * linking each person to its `companyRef`. Idempotent: a node that already
   * exists (company by domain/name, person by name-in-company) is UPDATED, not
   * duplicated. Records the run as a `discovery_job` for history/audit.
   *
   * When `analyze` is on, each upserted company/person is run through taxonomy
   * `classify()` (industry / occupation) and the resolved id stored. Classify is
   * best-effort + non-throwing — a $0-credit tenant just gets unclassified nodes.
   *
   * NOTE (honesty): this is the channel-NEUTRAL ingest sink only. The per-channel
   * browser scrapers (LinkedIn/Maps/IG/marketplace/TikTok extraction) are the
   * EXTENSION phase — not built here. The backend accepts whatever channel the
   * extension labels.
   */
  async ingestGraph(ctx: TenantContext, input: IngestGraphInput): Promise<IngestGraphResult> {
    const channel = assertEnum(input.channel, CHANNELS, "channel");
    const origin = input.origin ? assertEnum(input.origin, ORIGINS, "origin") : "extension";
    const posture = input.posture ? assertEnum(input.posture, POSTURES, "posture") : "compliant";
    const workspaceId = input.workspaceId ?? null;
    const ownerUserId = input.ownerUserId ?? null;
    const source = input.sourceUrl?.trim() || `discovery:${channel}`;
    const companies = input.companies ?? [];
    const people = input.people ?? [];
    const norm = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

    // Quota gate — block ingest when the tenant is already at its plan's contact/
    // company ceiling (unlimited plans + BYOK pass). Soft: a batch may overshoot by
    // one; the next ingest is blocked. Only NEW nodes consume quota (below).
    if (companies.length) await tenantService.enforceQuota(ctx, "companies_max", 1);
    if (people.length) await tenantService.enforceQuota(ctx, "contacts_max", 1);

    // Record the run for history (channel-tagged) BEFORE the upserts.
    const job = await enrichmentRepo.insertJob(ctx, {
      id: "dsj_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      workspaceId,
      query: `ingest:${channel}`,
      channel,
      source,
      status: "running",
      posture,
      origin,
      startedAt: new Date(),
    });

    let companiesUpserted = 0;
    let peopleUpserted = 0;
    let companiesClassified = 0;
    let peopleClassified = 0;
    let companiesCreated = 0; // NEW nodes only — drives quota consumption
    let peopleCreated = 0;
    // Every contact touched (created/updated) this batch — returned for downstream
    // routing (Fase 3 BYOA classify). Cheap: refs already in hand in the loop.
    const touchedContacts: IngestGraphContactRef[] = [];
    // Map a companyRef key (domain|name, lowercased) → the resolved company id, so
    // people can attach to the company we just upserted in THIS batch.
    const companyIdByKey = new Map<string, string>();

    try {
      // 1) Company nodes — upsert + (optionally) classify industry.
      for (const c of companies) {
        const name = c.name?.trim();
        if (!name) continue;
        const domain = c.domain?.trim() || null;
        // company_v2 has no first-class phone/email/address columns; persist these
        // captured company-level handles in the `socials` jsonb under explicit keys
        // (real, queryable — no data lost, no schema churn).
        const bag: Record<string, string> = {};
        if (c.phone?.trim()) bag.phone = c.phone.trim();
        if (c.email?.trim()) bag.email = c.email.trim();
        if (c.address?.trim()) bag.address = c.address.trim();
        const existing = await crmRepo.findCompanyByDomainOrName(ctx, domain, name);
        let company: CompanyRow;
        if (existing) {
          company = await crmService.updateCompany(ctx, existing.id, {
            name,
            domain: domain ?? existing.domain ?? undefined,
            industry: c.industry ?? existing.industry ?? undefined,
            size: c.size ?? existing.size ?? undefined,
            summary: c.summary ?? existing.summary ?? undefined,
            socials: Object.keys(bag).length ? { ...(existing.socials ?? {}), ...bag } : undefined,
            source: existing.source ?? source,
          });
        } else {
          company = await crmService.createCompany(ctx, {
            name,
            domain,
            industry: c.industry ?? null,
            size: c.size ?? null,
            summary: c.summary ?? null,
            socials: Object.keys(bag).length ? bag : null,
            source,
          });
          companiesCreated++;
        }
        companiesUpserted++;
        if (domain) companyIdByKey.set(`domain:${norm(domain)}`, company.id);
        companyIdByKey.set(`name:${norm(name)}`, company.id);

        if (input.analyze) {
          const tagged = await this.classifyCompanyTaxonomy(ctx, company);
          if (tagged) companiesClassified++;
        }
      }

      // 2) Person nodes — resolve company edge, upsert, (optionally) classify occupation.
      for (const p of people) {
        const fullName = p.fullName?.trim();
        if (!fullName) continue;
        // Resolve the company edge: prefer a company upserted in THIS batch, else
        // look one up by the ref's domain/name (so a person-only ingest still links).
        let companyId: string | null = null;
        const ref = p.companyRef ?? null;
        if (ref?.domain) companyId = companyIdByKey.get(`domain:${norm(ref.domain)}`) ?? null;
        if (!companyId && ref?.name) companyId = companyIdByKey.get(`name:${norm(ref.name)}`) ?? null;
        if (!companyId && (ref?.domain || ref?.name)) {
          const found = await crmRepo.findCompanyByDomainOrName(
            ctx,
            ref.domain?.trim() || null,
            ref.name?.trim() || "",
          );
          companyId = found?.id ?? null;
        }

        const socials: Record<string, string> = { ...(p.socials ?? {}) };
        if (p.channelProfileUrl?.trim()) socials[channel] = p.channelProfileUrl.trim();

        // Merge direction: enriched (Stage 2) OVERWRITES with the new value when
        // present; pending (Stage 1) only FILLS NULLS (existing wins). undefined =
        // the current web-discovery behaviour (overwrite-if-present).
        const merge = <T>(nv: T | null | undefined, ev: T | null | undefined): T | undefined =>
          p.enriched === false ? (ev ?? nv ?? undefined) : (nv ?? ev ?? undefined);

        const existing = await crmRepo.findContactByNameInCompany(ctx, fullName, companyId);
        let contact: ContactRow;
        if (existing) {
          const patch: Parameters<typeof crmService.updateContact>[2] = {
            companyId: companyId ?? existing.companyId ?? undefined,
            workspaceId: workspaceId ?? existing.workspaceId ?? undefined,
            title: merge(p.title, existing.title),
            department: merge(p.department, existing.department),
            seniority: merge(p.seniority, existing.seniority),
            email: merge(p.email, existing.email),
            phone: merge(p.phone, existing.phone),
            whatsapp: merge(p.whatsapp, existing.whatsapp),
            location: merge(p.location, existing.location),
            summary: merge(p.summary, existing.summary),
            socials: Object.keys(socials).length ? { ...(existing.socials ?? {}), ...socials } : undefined,
            ownerUserId: existing.ownerUserId ?? ownerUserId ?? undefined,
            source: existing.source ?? p.source ?? source,
          };
          // AI classification only overwrites when the caller actually classified
          // this person (don't null out a prior analysis on a bare re-crawl).
          if (p.segment) patch.segment = p.segment;
          if (typeof p.fitScore === "number") patch.fitScore = p.fitScore;
          if (p.fitReason) patch.fitReason = p.fitReason;
          // Never downgrade an enriched contact back to pending.
          if (p.enriched === true) patch.enrichmentStatus = "enriched";
          contact = await crmService.updateContact(ctx, existing.id, patch);
        } else {
          contact = await crmService.createContact(ctx, {
            fullName,
            companyId,
            workspaceId,
            title: p.title ?? null,
            department: p.department ?? null,
            seniority: p.seniority ?? null,
            email: p.email ?? null,
            phone: p.phone ?? null,
            whatsapp: p.whatsapp ?? null,
            location: p.location ?? null,
            summary: p.summary ?? null,
            socials: Object.keys(socials).length ? socials : null,
            // Default to "unknown" (not the enum's first value "b2c") when the
            // caller didn't classify — a bare crawl shouldn't assert a segment.
            segment: p.segment ?? "unknown",
            fitScore: p.fitScore ?? null,
            fitReason: p.fitReason ?? null,
            enrichmentStatus:
              p.enriched === true ? "enriched" : p.enriched === false ? "pending" : undefined,
            ownerUserId,
            source: p.source ?? source,
          });
          peopleCreated++;
        }
        peopleUpserted++;
        touchedContacts.push({
          id: contact.id,
          fullName: contact.fullName,
          title: contact.title ?? null,
          companyName: ref?.name ?? null,
          segment: contact.segment ?? null,
          isNew: !existing,
        });

        if (input.analyze) {
          const tagged = await this.classifyContactOccupation(ctx, contact);
          if (tagged) peopleClassified++;
        }
      }

      await enrichmentRepo.updateJob(ctx, job.id, {
        status: "done",
        resultsCount: companiesUpserted + peopleUpserted,
        finishedAt: new Date(),
      });
      await this.audit(ctx, "enrichment.ingest.graph", "discovery_job", job.id, {
        channel,
        companiesUpserted,
        peopleUpserted,
        companiesClassified,
        peopleClassified,
      });
    } catch (err) {
      await enrichmentRepo
        .updateJob(ctx, job.id, { status: "error", error: String(err), finishedAt: new Date() })
        .catch(() => {});
      throw err;
    }

    // Consume quota for the NEW nodes only (updates / re-crawls are free).
    if (companiesCreated) await tenantService.bumpUsage(ctx, "companies_max", companiesCreated);
    if (peopleCreated) await tenantService.bumpUsage(ctx, "contacts_max", peopleCreated);

    // Persistent notification: ONE batched "Lead baru" per ingest (not per contact —
    // a bulk commenter-import can create dozens, and N rows would spam the bell).
    // Tenant-wide; best-effort. Only when the graph actually produced NEW contacts.
    if (peopleCreated > 0) {
      await notificationService.emit(ctx, {
        type: "lead",
        title: "Lead baru",
        body: `${peopleCreated} lead baru masuk dari ${channel}.`,
        link: "/contacts",
        meta: { jobId: job.id, channel, peopleCreated, companiesCreated },
      });
    }

    return {
      companiesUpserted,
      peopleUpserted,
      companiesClassified,
      peopleClassified,
      jobId: job.id,
      contacts: touchedContacts,
    };
  },

  // ═══════════════════════ taxonomy classify-on-enrich ══════════════
  /**
   * Resolve + store the taxonomy `industry_id` for a CRM company. Non-throwing:
   * `taxonomyService.classify` already degrades to unclassified (null) on any AI
   * failure, so a $0-credit / no-key tenant just leaves the cell empty. Returns
   * true only when an id was actually resolved + written.
   */
  async classifyCompanyTaxonomy(ctx: TenantContext, company: CompanyRow): Promise<boolean> {
    const res = await taxonomyService.classify(ctx, {
      kind: "industry",
      entity: {
        name: company.name,
        companyName: company.name,
        website: company.website ?? company.domain ?? null,
        description: company.summary ?? company.industry ?? null,
      },
    });
    if (!res.id || res.id === company.industryId) return false; // unclassified or unchanged
    await crmService.updateCompany(ctx, company.id, { industryId: res.id }).catch(() => {});
    return true;
  },

  /**
   * Resolve + store the taxonomy `occupation_id` for a CRM contact (using its
   * title + its company name as context). Non-throwing, same degrade policy.
   */
  async classifyContactOccupation(ctx: TenantContext, contact: ContactRow): Promise<boolean> {
    let companyName: string | null = null;
    if (contact.companyId) {
      const co = await crmRepo.getCompany(ctx, contact.companyId);
      companyName = co?.name ?? null;
    }
    const res = await taxonomyService.classify(ctx, {
      kind: "occupation",
      entity: {
        name: contact.fullName,
        title: contact.title ?? null,
        companyName,
      },
    });
    if (!res.id || res.id === contact.occupationId) return false;
    await crmService.updateContact(ctx, contact.id, { occupationId: res.id }).catch(() => {});
    return true;
  },

  /**
   * Classify-on-enrich for an existing CRM contact id: resolve its occupation AND
   * its company's industry. Used by `runEnrichment` / `pushRecordToContact` once a
   * contact exists. Best-effort; never throws.
   */
  async classifyContactTaxonomy(ctx: TenantContext, contactId: string): Promise<void> {
    const contact = await crmRepo.getContact(ctx, contactId);
    if (!contact) return;
    await this.classifyContactOccupation(ctx, contact);
    if (contact.companyId) {
      const company = await crmRepo.getCompany(ctx, contact.companyId);
      if (company) await this.classifyCompanyTaxonomy(ctx, company);
    }
  },

  // ═══════════════════════ internal helpers ═════════════════════════
  /** Seed enrichment fields from a raw discovery result. */
  fieldsFromResult(result: DiscoveryResultRow): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (result.fullName) out.fullName = result.fullName;
    if (result.companyName) out.companyName = result.companyName;
    if (result.title) out.title = result.title;
    if (result.email) out.email = result.email;
    if (result.phone) out.phone = result.phone;
    if (result.whatsapp) out.whatsapp = result.whatsapp;
    if (result.location) out.location = result.location;
    if (result.website) out.website = result.website;
    if (result.socials) out.socials = result.socials;
    return out;
  },

  /** Collect classify signals from a record's fields, falling back to its result. */
  async signalsForRecord(
    ctx: TenantContext,
    record: EnrichmentRecordRow,
  ): Promise<ClassifySignals> {
    const f = (record.fields ?? {}) as Record<string, unknown>;
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim() : null;
    const socials = (f.socials as Record<string, string> | undefined) ?? undefined;
    const fromFields: ClassifySignals = {
      companyName: str(f.companyName),
      title: str(f.title),
      email: str(f.email),
      phone: str(f.phone),
      whatsapp: str(f.whatsapp),
      socials: socials ?? null,
    };
    // Backfill any missing signal from the originating discovery result.
    if (record.resultId) {
      const result = await enrichmentRepo.getResult(ctx, record.resultId);
      if (result) {
        fromFields.companyName ??= result.companyName;
        fromFields.title ??= result.title;
        fromFields.email ??= result.email;
        fromFields.phone ??= result.phone;
        fromFields.whatsapp ??= result.whatsapp;
        fromFields.socials ??= result.socials ?? null;
      }
    }
    return fromFields;
  },

  /** Write a tenant-scoped audit row for an enrichment/discovery mutation. */
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
