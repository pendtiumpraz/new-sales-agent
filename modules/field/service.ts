import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { crmService } from "@/modules/crm/service";
import { fieldRepo } from "./repo";
import type { FieldVisitRow, FieldCheckInRow } from "./schema";

/**
 * field domain service — field-sales VISIT + geo-stamped CHECK-IN business logic +
 * validation + cross-module side effects (audit) + app-level cascade. Routes stay
 * thin: parse → call a method → wrap with the {ok,error} envelope.
 *
 * Owns two tables (field_visit, field_check_in). Referential integrity is enforced
 * HERE (app layer), never via DB FKs (none exist):
 *   - a visit's optional `contact_id` / `company_id` are validated against live CRM
 *     rows through the OWNING module's service (`crmService`, modular-monolith
 *     rule — never reach into another module's tables);
 *   - a check-in's `visit_id` against a live visit in THIS module.
 * A check-in also drives the visit's lifecycle: the first `check_in` stamps
 * `started_at` (status → in_progress); a `check_out` stamps `ended_at`. Soft-
 * delete/restore/purge of a visit CASCADES to its check-ins.
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo scopes
 * all reads/writes to `ctx.tenantId` inside `withTenant`.
 */

// ── enums ────────────────────────────────────────────────────────────────────
const VISIT_STATUSES = [
  "planned",
  "en_route",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;
const CHECK_IN_KINDS = ["check_in", "check_out"] as const;

// ── input shapes ─────────────────────────────────────────────────────────────
export interface CreateVisitInput {
  title: string;
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  repUserId?: string | null;
  purpose?: string | null;
  address?: string | null;
  scheduledAt?: string | null;
  status?: string;
  notes?: string | null;
  workspaceId?: string | null;
  meta?: Record<string, unknown> | null;
}
export interface UpdateVisitInput {
  title?: string;
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  repUserId?: string | null;
  purpose?: string | null;
  address?: string | null;
  scheduledAt?: string | null;
  status?: string;
  outcome?: string | null;
  notes?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface CreateCheckInInput {
  visitId: string;
  kind?: string;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  address?: string | null;
  photoUrl?: string | null;
  note?: string | null;
  recordedAt?: string | null;
  meta?: Record<string, unknown> | null;
}
export type UpdateCheckInInput = Partial<Omit<CreateCheckInInput, "visitId">>;

// ── validation helpers ───────────────────────────────────────────────────────
function assertEnum(value: string | undefined, allowed: readonly string[], field: string): string {
  const v = value ?? allowed[0];
  if (!allowed.includes(v)) {
    throw new ServiceError(`${field} harus salah satu dari: ${allowed.join(", ")}`, 400, "validation");
  }
  return v;
}

function parseDate(value: string | null | undefined, field: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ServiceError(`${field} tidak valid`, 400, "validation");
  }
  return d;
}

export const fieldService = {
  // ═══════════════════════ field_visit ══════════════════════════════
  async listVisits(
    ctx: TenantContext,
    filter?: { repUserId?: string; contactId?: string; status?: string; workspaceId?: string },
  ): Promise<FieldVisitRow[]> {
    if (filter?.status) assertEnum(filter.status, VISIT_STATUSES, "status");
    return fieldRepo.listVisits(ctx, filter);
  },

  async listTrashedVisits(ctx: TenantContext): Promise<FieldVisitRow[]> {
    return fieldRepo.listTrashedVisits(ctx);
  },

  async getVisit(ctx: TenantContext, id: string): Promise<FieldVisitRow> {
    const row = await fieldRepo.getVisit(ctx, id);
    if (!row) throw new ServiceError("Kunjungan tidak ditemukan", 404, "not_found");
    return row;
  },

  async createVisit(ctx: TenantContext, input: CreateVisitInput): Promise<FieldVisitRow> {
    const title = input.title?.trim();
    if (!title) throw new ServiceError("Judul kunjungan wajib diisi", 400, "validation");
    const status = assertEnum(input.status, VISIT_STATUSES, "status");
    // Integrity: link only live CRM rows (owning module's service).
    if (input.contactId) await crmService.getContact(ctx, input.contactId);
    if (input.companyId) await crmService.getCompany(ctx, input.companyId);
    const scheduledAt = parseDate(input.scheduledAt, "scheduled_at");

    const row = await fieldRepo.insertVisit(ctx, {
      id: "fvs_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      workspaceId: input.workspaceId ?? null,
      contactId: input.contactId ?? null,
      companyId: input.companyId ?? null,
      dealId: input.dealId ?? null,
      repUserId: input.repUserId ?? ctx.userId,
      title,
      purpose: input.purpose ?? null,
      address: input.address ?? null,
      scheduledAt,
      status,
      notes: input.notes ?? null,
      meta: input.meta ?? null,
      createdBy: ctx.userId,
    });
    await this.audit(ctx, "field.visit.create", "field_visit", row.id, { status });
    return row;
  },

  async updateVisit(
    ctx: TenantContext,
    id: string,
    input: UpdateVisitInput,
  ): Promise<FieldVisitRow> {
    await this.getVisit(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) {
      const title = input.title?.trim();
      if (!title) throw new ServiceError("Judul kunjungan wajib diisi", 400, "validation");
      patch.title = title;
    }
    if (input.status !== undefined) patch.status = assertEnum(input.status, VISIT_STATUSES, "status");
    if (input.contactId !== undefined) {
      if (input.contactId) await crmService.getContact(ctx, input.contactId);
      patch.contactId = input.contactId;
    }
    if (input.companyId !== undefined) {
      if (input.companyId) await crmService.getCompany(ctx, input.companyId);
      patch.companyId = input.companyId;
    }
    if (input.scheduledAt !== undefined)
      patch.scheduledAt = parseDate(input.scheduledAt, "scheduled_at");
    for (const f of ["dealId", "repUserId", "purpose", "address", "outcome", "notes", "meta"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await fieldRepo.updateVisit(ctx, id, patch);
    if (!row) throw new ServiceError("Kunjungan tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "field.visit.update", "field_visit", id, { fields: Object.keys(patch) });
    return row;
  },

  async softDeleteVisit(ctx: TenantContext, id: string): Promise<void> {
    const ok = await fieldRepo.softDeleteVisit(ctx, id);
    if (!ok) throw new ServiceError("Kunjungan tidak ditemukan", 404, "not_found");
    await fieldRepo.setCheckInsDeletedByVisit(ctx, id, true);
    await this.audit(ctx, "field.visit.delete", "field_visit", id);
  },

  async restoreVisit(ctx: TenantContext, id: string): Promise<FieldVisitRow> {
    const ok = await fieldRepo.restoreVisit(ctx, id);
    if (!ok) throw new ServiceError("Kunjungan tidak ada di trash", 404, "not_found");
    await fieldRepo.setCheckInsDeletedByVisit(ctx, id, false);
    await this.audit(ctx, "field.visit.restore", "field_visit", id);
    return this.getVisit(ctx, id);
  },

  async hardDeleteVisit(ctx: TenantContext, id: string): Promise<void> {
    const ok = await fieldRepo.hardDeleteVisit(ctx, id);
    if (!ok) throw new ServiceError("Kunjungan tidak ditemukan", 404, "not_found");
    await fieldRepo.hardDeleteCheckInsByVisit(ctx, id);
    await this.audit(ctx, "field.visit.purge", "field_visit", id);
  },

  // ═══════════════════════ field_check_in ═══════════════════════════
  async listCheckIns(ctx: TenantContext, visitId: string): Promise<FieldCheckInRow[]> {
    await this.getVisit(ctx, visitId);
    return fieldRepo.listCheckIns(ctx, visitId);
  },

  async listTrashedCheckIns(ctx: TenantContext): Promise<FieldCheckInRow[]> {
    return fieldRepo.listTrashedCheckIns(ctx);
  },

  async getCheckIn(ctx: TenantContext, id: string): Promise<FieldCheckInRow> {
    const row = await fieldRepo.getCheckIn(ctx, id);
    if (!row) throw new ServiceError("Check-in tidak ditemukan", 404, "not_found");
    return row;
  },

  /**
   * Record a check-in/out on a visit. Validates the visit live (this module), then
   * inserts the geo-stamped event and advances the visit's lifecycle: the first
   * `check_in` stamps `started_at` + status → in_progress; a `check_out` stamps
   * `ended_at` + status → completed (when not already terminal).
   */
  async createCheckIn(ctx: TenantContext, input: CreateCheckInInput): Promise<FieldCheckInRow> {
    const visitId = input.visitId?.trim();
    if (!visitId) throw new ServiceError("visit_id wajib diisi", 400, "validation");
    const visit = await this.getVisit(ctx, visitId);
    const kind = assertEnum(input.kind, CHECK_IN_KINDS, "kind");
    const recordedAt = parseDate(input.recordedAt, "recorded_at") ?? new Date();

    const row = await fieldRepo.insertCheckIn(ctx, {
      id: "fci_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      visitId,
      repUserId: ctx.userId,
      kind,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      accuracy: input.accuracy ?? null,
      address: input.address ?? null,
      photoUrl: input.photoUrl ?? null,
      note: input.note ?? null,
      recordedAt,
      meta: input.meta ?? null,
    });

    // Advance the visit's lifecycle off the check-in event.
    const visitPatch: Record<string, unknown> = {};
    if (kind === "check_in" && !visit.startedAt) {
      visitPatch.startedAt = recordedAt;
      if (visit.status === "planned" || visit.status === "en_route") {
        visitPatch.status = "in_progress";
      }
    }
    if (kind === "check_out") {
      visitPatch.endedAt = recordedAt;
      if (visit.status === "in_progress" || visit.status === "en_route") {
        visitPatch.status = "completed";
      }
    }
    if (Object.keys(visitPatch).length > 0) {
      await fieldRepo.updateVisit(ctx, visitId, visitPatch);
    }
    await this.audit(ctx, "field.checkin.create", "field_check_in", row.id, { visitId, kind });
    return row;
  },

  async updateCheckIn(
    ctx: TenantContext,
    id: string,
    input: UpdateCheckInInput,
  ): Promise<FieldCheckInRow> {
    await this.getCheckIn(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.kind !== undefined) patch.kind = assertEnum(input.kind, CHECK_IN_KINDS, "kind");
    if (input.recordedAt !== undefined)
      patch.recordedAt = parseDate(input.recordedAt, "recorded_at") ?? new Date();
    for (const f of ["lat", "lng", "accuracy", "address", "photoUrl", "note", "meta"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await fieldRepo.updateCheckIn(ctx, id, patch);
    if (!row) throw new ServiceError("Check-in tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "field.checkin.update", "field_check_in", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  async softDeleteCheckIn(ctx: TenantContext, id: string): Promise<void> {
    const ok = await fieldRepo.softDeleteCheckIn(ctx, id);
    if (!ok) throw new ServiceError("Check-in tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "field.checkin.delete", "field_check_in", id);
  },

  async restoreCheckIn(ctx: TenantContext, id: string): Promise<FieldCheckInRow> {
    const ok = await fieldRepo.restoreCheckIn(ctx, id);
    if (!ok) throw new ServiceError("Check-in tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "field.checkin.restore", "field_check_in", id);
    return this.getCheckIn(ctx, id);
  },

  async hardDeleteCheckIn(ctx: TenantContext, id: string): Promise<void> {
    const ok = await fieldRepo.hardDeleteCheckIn(ctx, id);
    if (!ok) throw new ServiceError("Check-in tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "field.checkin.purge", "field_check_in", id);
  },

  // ═══════════════════════ internal helpers ═════════════════════════
  /** Write a tenant-scoped audit row for a field mutation. */
  async audit(
    ctx: TenantContext,
    action: string,
    targetType: string,
    targetId: string | null,
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
