import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { notificationService } from "@/modules/notification/service";
import { crmService } from "@/modules/crm/service";
import { inboxService } from "@/modules/inbox/service";
import { outreachRepo } from "./repo";
import type {
  CadenceRow,
  CadenceStepRow,
  CadenceEnrollmentRow,
  AutopilotRunRow,
  EscalationRow,
  HandoffRow,
} from "./schema";

/**
 * outreach domain service — follow-up automation business logic + validation +
 * cross-module side effects (audit) + app-level cascade. Routes stay thin: parse
 * → call a method → wrap with the {ok,error} envelope.
 *
 * Owns six tables (cadence_v2, cadence_step_v2, cadence_enrollment_v2,
 * autopilot_run_v2, escalation, handoff). Referential integrity is enforced HERE
 * (app layer), never via DB FKs (none exist):
 *   - an enrollment's `contact_id` is validated against a live CRM contact through
 *     the OWNING module's service (`crmService`, modular-monolith rule — never
 *     reach into another module's tables);
 *   - an escalation/handoff `conversation_id` against a live conversation through
 *     `inboxService`;
 *   - a step / enrollment's `cadence_id` against a live cadence in THIS module.
 * Soft-delete/restore/purge of a cadence CASCADES to its steps + enrollments in
 * the app layer.
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo scopes
 * all reads/writes to `ctx.tenantId` inside `withTenant`. Rows are additionally
 * scoped by workspace_id / contact_id / conversation_id in-app (no FK).
 */

// ── enums ────────────────────────────────────────────────────────────────────
const CADENCE_STATUSES = ["active", "paused", "archived"] as const;
const STEP_CHANNELS = ["wa", "email", "call"] as const;
const ENROLLMENT_STATUSES = ["active", "paused", "completed", "stopped"] as const;
const RUN_MODES = ["suggest", "auto"] as const;
const RUN_STATUSES = ["queued", "running", "done", "error", "escalated"] as const;
const ESCALATION_REASONS = [
  "objection",
  "pricing",
  "complaint",
  "low_confidence",
  "manual",
  "policy",
] as const;
const ESCALATION_STATUSES = ["open", "acknowledged", "resolved", "dismissed"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const HANDOFF_STATUSES = ["pending", "claimed", "done", "cancelled"] as const;

// ── input shapes ─────────────────────────────────────────────────────────────
export interface CreateCadenceInput {
  name: string;
  description?: string | null;
  workspaceId?: string | null;
  status?: string; // active|paused|archived
}
export type UpdateCadenceInput = Partial<CreateCadenceInput>;

export interface CreateStepInput {
  cadenceId: string;
  channel?: string; // wa|email|call
  delayHours?: number;
  subject?: string | null;
  template?: string;
  sort?: number;
  meta?: Record<string, unknown> | null;
}
export type UpdateStepInput = Partial<Omit<CreateStepInput, "cadenceId">>;

export interface EnrollInput {
  cadenceId: string;
  contactId: string;
  workspaceId?: string | null;
  conversationId?: string | null;
  assignedUserId?: string | null;
}

export interface CreateRunInput {
  conversationId?: string | null;
  contactId?: string | null;
  workspaceId?: string | null;
  enrollmentId?: string | null;
  mode?: string; // suggest|auto
  trigger?: string | null;
  status?: string; // queued|running|done|error|escalated
  summary?: string | null;
}
export interface UpdateRunInput {
  status?: string;
  summary?: string | null;
  error?: string | null;
  logEntry?: Record<string, unknown>; // appended to the run log
  logEntries?: Record<string, unknown>[]; // batch-appended to the run log (in order)
}

export interface CreateEscalationInput {
  conversationId: string;
  contactId?: string | null;
  workspaceId?: string | null;
  autopilotRunId?: string | null;
  reason?: string;
  detail?: string | null;
  priority?: string;
  assignedUserId?: string | null;
}
export interface UpdateEscalationInput {
  status?: string;
  priority?: string;
  detail?: string | null;
  assignedUserId?: string | null;
  resolutionNote?: string | null;
}

export interface CreateHandoffInput {
  conversationId: string;
  contactId?: string | null;
  workspaceId?: string | null;
  escalationId?: string | null;
  reason?: string | null;
  note?: string | null;
  priority?: string;
  assignedUserId?: string | null;
  dueAt?: string | null;
}
export interface UpdateHandoffInput {
  status?: string;
  priority?: string;
  note?: string | null;
  assignedUserId?: string | null;
  dueAt?: string | null;
}

// ── validation helpers ───────────────────────────────────────────────────────
function assertEnum(
  value: string | undefined,
  allowed: readonly string[],
  field: string,
): string {
  const v = value ?? allowed[0];
  if (!allowed.includes(v)) {
    throw new ServiceError(
      `${field} harus salah satu dari: ${allowed.join(", ")}`,
      400,
      "validation",
    );
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

export const outreachService = {
  // ═══════════════════════ cadence ══════════════════════════════════
  async listCadences(
    ctx: TenantContext,
    filter?: { workspaceId?: string; status?: string },
  ): Promise<CadenceRow[]> {
    return outreachRepo.listCadences(ctx, filter);
  },

  async listTrashedCadences(ctx: TenantContext): Promise<CadenceRow[]> {
    return outreachRepo.listTrashedCadences(ctx);
  },

  async getCadence(ctx: TenantContext, id: string): Promise<CadenceRow> {
    const row = await outreachRepo.getCadence(ctx, id);
    if (!row) throw new ServiceError("Cadence tidak ditemukan", 404, "not_found");
    return row;
  },

  async createCadence(ctx: TenantContext, input: CreateCadenceInput): Promise<CadenceRow> {
    const name = input.name?.trim();
    if (!name) throw new ServiceError("Nama cadence wajib diisi", 400, "validation");
    const status = assertEnum(input.status, CADENCE_STATUSES, "status");
    const row = await outreachRepo.insertCadence(ctx, {
      id: "cad_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      workspaceId: input.workspaceId ?? null,
      name,
      description: input.description ?? null,
      status,
      stepCount: 0,
      createdBy: ctx.userId,
    });
    await this.audit(ctx, "outreach.cadence.create", "cadence", row.id, { name });
    return row;
  },

  async updateCadence(
    ctx: TenantContext,
    id: string,
    input: UpdateCadenceInput,
  ): Promise<CadenceRow> {
    await this.getCadence(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new ServiceError("Nama cadence wajib diisi", 400, "validation");
      patch.name = name;
    }
    if (input.status !== undefined)
      patch.status = assertEnum(input.status, CADENCE_STATUSES, "status");
    for (const f of ["description", "workspaceId"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await outreachRepo.updateCadence(ctx, id, patch);
    if (!row) throw new ServiceError("Cadence tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.cadence.update", "cadence", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  async softDeleteCadence(ctx: TenantContext, id: string): Promise<void> {
    const ok = await outreachRepo.softDeleteCadence(ctx, id);
    if (!ok) throw new ServiceError("Cadence tidak ditemukan", 404, "not_found");
    // App-level cascade: trash the cadence's steps + enrollments alongside it.
    await outreachRepo.setStepsDeletedByCadence(ctx, id, true);
    await outreachRepo.setEnrollmentsDeletedByCadence(ctx, id, true);
    await this.audit(ctx, "outreach.cadence.delete", "cadence", id);
  },

  async restoreCadence(ctx: TenantContext, id: string): Promise<CadenceRow> {
    const ok = await outreachRepo.restoreCadence(ctx, id);
    if (!ok) throw new ServiceError("Cadence tidak ada di trash", 404, "not_found");
    await outreachRepo.setStepsDeletedByCadence(ctx, id, false);
    await outreachRepo.setEnrollmentsDeletedByCadence(ctx, id, false);
    await this.audit(ctx, "outreach.cadence.restore", "cadence", id);
    return this.getCadence(ctx, id);
  },

  async hardDeleteCadence(ctx: TenantContext, id: string): Promise<void> {
    const ok = await outreachRepo.hardDeleteCadence(ctx, id);
    if (!ok) throw new ServiceError("Cadence tidak ditemukan", 404, "not_found");
    await outreachRepo.hardDeleteStepsByCadence(ctx, id);
    await outreachRepo.hardDeleteEnrollmentsByCadence(ctx, id);
    await this.audit(ctx, "outreach.cadence.purge", "cadence", id);
  },

  // ═══════════════════════ cadence_step ═════════════════════════════
  async listSteps(ctx: TenantContext, cadenceId: string): Promise<CadenceStepRow[]> {
    await this.getCadence(ctx, cadenceId);
    return outreachRepo.listSteps(ctx, cadenceId);
  },

  async listTrashedSteps(ctx: TenantContext): Promise<CadenceStepRow[]> {
    return outreachRepo.listTrashedSteps(ctx);
  },

  async getStep(ctx: TenantContext, id: string): Promise<CadenceStepRow> {
    const row = await outreachRepo.getStep(ctx, id);
    if (!row) throw new ServiceError("Step cadence tidak ditemukan", 404, "not_found");
    return row;
  },

  async createStep(ctx: TenantContext, input: CreateStepInput): Promise<CadenceStepRow> {
    const cadenceId = input.cadenceId?.trim();
    if (!cadenceId) throw new ServiceError("cadence_id wajib diisi", 400, "validation");
    // Integrity: a step must belong to a live cadence in this tenant.
    await this.getCadence(ctx, cadenceId);
    const channel = assertEnum(input.channel, STEP_CHANNELS, "channel");
    const delayHours = Math.max(0, Math.trunc(input.delayHours ?? 0));
    // Default the order to the end of the cadence when no explicit sort is given.
    const sort = input.sort ?? (await outreachRepo.countSteps(ctx, cadenceId));

    const row = await outreachRepo.insertStep(ctx, {
      id: "cds_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      cadenceId,
      sort,
      channel,
      delayHours,
      subject: input.subject ?? null,
      template: input.template ?? "",
      meta: input.meta ?? null,
    });
    await outreachRepo.bumpStepCount(ctx, cadenceId, 1);
    await this.audit(ctx, "outreach.step.create", "cadence_step", row.id, {
      cadenceId,
      channel,
    });
    return row;
  },

  async updateStep(
    ctx: TenantContext,
    id: string,
    input: UpdateStepInput,
  ): Promise<CadenceStepRow> {
    await this.getStep(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.channel !== undefined)
      patch.channel = assertEnum(input.channel, STEP_CHANNELS, "channel");
    if (input.delayHours !== undefined)
      patch.delayHours = Math.max(0, Math.trunc(input.delayHours));
    for (const f of ["subject", "template", "sort", "meta"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await outreachRepo.updateStep(ctx, id, patch);
    if (!row) throw new ServiceError("Step cadence tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.step.update", "cadence_step", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  async softDeleteStep(ctx: TenantContext, id: string): Promise<void> {
    const step = await outreachRepo.getStep(ctx, id);
    const ok = await outreachRepo.softDeleteStep(ctx, id);
    if (!ok) throw new ServiceError("Step cadence tidak ditemukan", 404, "not_found");
    if (step) await outreachRepo.bumpStepCount(ctx, step.cadenceId, -1);
    await this.audit(ctx, "outreach.step.delete", "cadence_step", id);
  },

  async restoreStep(ctx: TenantContext, id: string): Promise<CadenceStepRow> {
    const ok = await outreachRepo.restoreStep(ctx, id);
    if (!ok) throw new ServiceError("Step tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "outreach.step.restore", "cadence_step", id);
    const row = await this.getStep(ctx, id);
    await outreachRepo.bumpStepCount(ctx, row.cadenceId, 1);
    return row;
  },

  async hardDeleteStep(ctx: TenantContext, id: string): Promise<void> {
    const step = await outreachRepo.getStep(ctx, id);
    const ok = await outreachRepo.hardDeleteStep(ctx, id);
    if (!ok) throw new ServiceError("Step cadence tidak ditemukan", 404, "not_found");
    // A purge of a LIVE step decrements the count; a trashed step was already
    // excluded (its delete-time decrement happened), so don't double-count.
    if (step && !step.deletedAt) await outreachRepo.bumpStepCount(ctx, step.cadenceId, -1);
    await this.audit(ctx, "outreach.step.purge", "cadence_step", id);
  },

  /**
   * Authoritative recompute of the cadence's denormalized `step_count` from a
   * single SQL `count()`. The hot step-mutation paths (create/delete/restore/
   * purge) instead use the atomic `bumpStepCount(±1)` to avoid a scan per write
   * (audit #31); this full recompute remains as a reconciliation/repair helper
   * (e.g. after a bulk cascade) should the denormalized count ever drift.
   */
  async syncStepCount(ctx: TenantContext, cadenceId: string): Promise<void> {
    const count = await outreachRepo.countSteps(ctx, cadenceId);
    await outreachRepo.updateCadence(ctx, cadenceId, { stepCount: count });
  },

  // ═══════════════════════ cadence_enrollment ═══════════════════════
  async listEnrollments(
    ctx: TenantContext,
    filter?: { cadenceId?: string; contactId?: string; status?: string },
  ): Promise<CadenceEnrollmentRow[]> {
    if (filter?.status) assertEnum(filter.status, ENROLLMENT_STATUSES, "status");
    return outreachRepo.listEnrollments(ctx, filter);
  },

  async listDueEnrollments(
    ctx: TenantContext,
    limit?: number,
  ): Promise<CadenceEnrollmentRow[]> {
    return outreachRepo.listDueEnrollments(ctx, new Date(), limit);
  },

  async listTrashedEnrollments(ctx: TenantContext): Promise<CadenceEnrollmentRow[]> {
    return outreachRepo.listTrashedEnrollments(ctx);
  },

  async getEnrollment(ctx: TenantContext, id: string): Promise<CadenceEnrollmentRow> {
    const row = await outreachRepo.getEnrollment(ctx, id);
    if (!row) throw new ServiceError("Enrollment tidak ditemukan", 404, "not_found");
    return row;
  },

  /**
   * Enroll a contact in a cadence. Validates the cadence (this module) + contact
   * (CRM, the owning module) live, then upserts the (cadence, contact) row and
   * schedules the FIRST step's run-time (now + step[0].delay_hours). Re-enrolling
   * a stopped/completed contact reuses the same row (resets to step 0, active).
   */
  async enroll(ctx: TenantContext, input: EnrollInput): Promise<CadenceEnrollmentRow> {
    const cadenceId = input.cadenceId?.trim();
    const contactId = input.contactId?.trim();
    if (!cadenceId) throw new ServiceError("cadence_id wajib diisi", 400, "validation");
    if (!contactId) throw new ServiceError("contact_id wajib diisi", 400, "validation");
    const cadence = await this.getCadence(ctx, cadenceId);
    // Integrity: enroll only a live CRM contact (owning module's service).
    await crmService.getContact(ctx, contactId);

    const steps = await outreachRepo.listSteps(ctx, cadenceId);
    if (steps.length === 0) {
      throw new ServiceError("Cadence belum punya step", 400, "no_steps");
    }
    const firstDelay = steps[0].delayHours ?? 0;
    const nextRunAt = new Date(Date.now() + firstDelay * 3600_000);

    const row = await outreachRepo.upsertEnrollment(ctx, cadenceId, contactId, {
      workspaceId: input.workspaceId ?? cadence.workspaceId ?? null,
      conversationId: input.conversationId ?? null,
      assignedUserId: input.assignedUserId ?? ctx.userId,
      currentStep: 0,
      status: "active",
      nextRunAt,
      lastStepAt: null,
      completedAt: null,
      stopReason: null,
    });
    await this.audit(ctx, "outreach.enrollment.enroll", "cadence_enrollment", row.id, {
      cadenceId,
      contactId,
    });
    return row;
  },

  /**
   * Advance an enrollment to its next step. Marks the current step fired
   * (`last_step_at=now`), increments `current_step`, and either schedules the next
   * step's `next_run_at` or completes the enrollment when the last step is past.
   * The cadence processor calls this once a due step has been actioned.
   */
  async advance(ctx: TenantContext, id: string): Promise<CadenceEnrollmentRow> {
    const enr = await this.getEnrollment(ctx, id);
    if (enr.status !== "active") {
      throw new ServiceError("Enrollment tidak aktif", 409, "not_active");
    }
    const steps = await outreachRepo.listSteps(ctx, enr.cadenceId);
    const nextIndex = enr.currentStep + 1;
    const now = new Date();

    let patch: Record<string, unknown>;
    if (nextIndex >= steps.length) {
      // Past the last step → complete.
      patch = {
        currentStep: nextIndex,
        status: "completed",
        lastStepAt: now,
        nextRunAt: null,
        completedAt: now,
      };
    } else {
      const delay = steps[nextIndex].delayHours ?? 0;
      patch = {
        currentStep: nextIndex,
        lastStepAt: now,
        nextRunAt: new Date(now.getTime() + delay * 3600_000),
      };
    }
    const row = await outreachRepo.updateEnrollment(ctx, id, patch);
    if (!row) throw new ServiceError("Enrollment tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.enrollment.advance", "cadence_enrollment", id, {
      currentStep: row.currentStep,
      status: row.status,
    });
    return row;
  },

  /** Pause / resume / stop an enrollment (status transition). */
  async setEnrollmentStatus(
    ctx: TenantContext,
    id: string,
    status: string,
    stopReason?: string | null,
  ): Promise<CadenceEnrollmentRow> {
    const next = assertEnum(status, ENROLLMENT_STATUSES, "status");
    await this.getEnrollment(ctx, id);
    const patch: Record<string, unknown> = { status: next };
    if (next === "stopped") {
      patch.stopReason = stopReason ?? "manual";
      patch.nextRunAt = null;
    }
    if (next === "completed") {
      patch.completedAt = new Date();
      patch.nextRunAt = null;
    }
    if (next === "active") {
      patch.stopReason = null;
    }
    const row = await outreachRepo.updateEnrollment(ctx, id, patch);
    if (!row) throw new ServiceError("Enrollment tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.enrollment.status", "cadence_enrollment", id, {
      status: next,
    });
    return row;
  },

  async softDeleteEnrollment(ctx: TenantContext, id: string): Promise<void> {
    const ok = await outreachRepo.softDeleteEnrollment(ctx, id);
    if (!ok) throw new ServiceError("Enrollment tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.enrollment.delete", "cadence_enrollment", id);
  },

  async restoreEnrollment(ctx: TenantContext, id: string): Promise<CadenceEnrollmentRow> {
    const ok = await outreachRepo.restoreEnrollment(ctx, id);
    if (!ok) throw new ServiceError("Enrollment tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "outreach.enrollment.restore", "cadence_enrollment", id);
    return this.getEnrollment(ctx, id);
  },

  async hardDeleteEnrollment(ctx: TenantContext, id: string): Promise<void> {
    const ok = await outreachRepo.hardDeleteEnrollment(ctx, id);
    if (!ok) throw new ServiceError("Enrollment tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.enrollment.purge", "cadence_enrollment", id);
  },

  // ═══════════════════════ autopilot_run ════════════════════════════
  async listRuns(
    ctx: TenantContext,
    filter?: { conversationId?: string; contactId?: string; status?: string; mode?: string },
  ): Promise<AutopilotRunRow[]> {
    if (filter?.status) assertEnum(filter.status, RUN_STATUSES, "status");
    if (filter?.mode) assertEnum(filter.mode, RUN_MODES, "mode");
    return outreachRepo.listRuns(ctx, filter);
  },

  async listTrashedRuns(ctx: TenantContext): Promise<AutopilotRunRow[]> {
    return outreachRepo.listTrashedRuns(ctx);
  },

  async getRun(ctx: TenantContext, id: string): Promise<AutopilotRunRow> {
    const row = await outreachRepo.getRun(ctx, id);
    if (!row) throw new ServiceError("Autopilot run tidak ditemukan", 404, "not_found");
    return row;
  },

  /**
   * Start an autopilot run (the AI auto-orchestration record). Validates the
   * conversation live (inbox, owning module) when supplied, then inserts a row.
   * The actual AI orchestration is driven elsewhere; this records its lifecycle.
   */
  async createRun(ctx: TenantContext, input: CreateRunInput): Promise<AutopilotRunRow> {
    const mode = assertEnum(input.mode, RUN_MODES, "mode");
    const status = assertEnum(input.status, RUN_STATUSES, "status");
    if (input.conversationId) {
      await inboxService.getConversation(ctx, input.conversationId);
    }
    const now = new Date();
    const row = await outreachRepo.insertRun(ctx, {
      id: "apr_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      workspaceId: input.workspaceId ?? null,
      contactId: input.contactId ?? null,
      conversationId: input.conversationId ?? null,
      enrollmentId: input.enrollmentId ?? null,
      mode,
      status,
      trigger: input.trigger ?? "manual",
      log: [],
      summary: input.summary ?? null,
      startedAt: status === "running" ? now : null,
    });
    await this.audit(ctx, "outreach.autopilot.create", "autopilot_run", row.id, { mode, status });
    return row;
  },

  /**
   * Update an autopilot run: transition status, append a log entry, set summary/
   * error. Stamps `started_at`/`finished_at` on the relevant transitions.
   */
  async updateRun(
    ctx: TenantContext,
    id: string,
    input: UpdateRunInput,
  ): Promise<AutopilotRunRow> {
    const run = await this.getRun(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) {
      const status = assertEnum(input.status, RUN_STATUSES, "status");
      patch.status = status;
      if (status === "running" && !run.startedAt) patch.startedAt = new Date();
      if (["done", "error", "escalated"].includes(status)) patch.finishedAt = new Date();
    }
    if (input.summary !== undefined) patch.summary = input.summary;
    if (input.error !== undefined) patch.error = input.error;
    if (input.logEntry !== undefined || input.logEntries !== undefined) {
      const base = Array.isArray(run.log) ? run.log : [];
      const incoming: Record<string, unknown>[] = [];
      if (input.logEntry !== undefined) incoming.push(input.logEntry);
      if (input.logEntries !== undefined) incoming.push(...input.logEntries);
      const stamped = incoming.map((e) => ({ at: new Date().toISOString(), ...e }));
      patch.log = [...base, ...stamped];
    }
    const row = await outreachRepo.updateRun(ctx, id, patch);
    if (!row) throw new ServiceError("Autopilot run tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.autopilot.update", "autopilot_run", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  /**
   * Drive a queued/error run to completion SERVER-SIDE — the piece that was
   * missing (runs were created "queued" and never advanced). Flips the run to
   * `running` (stamps started_at), then REUSES the WA closing-flow orchestrator
   * (`buildWaReply`) over the linked conversation to draft the next reply — no
   * duplicated AI call. It appends a structured `log` trace and finishes the run:
   *   - `auto`    → the drafted bubbles are persisted as OUTBOUND messages on the
   *                 conversation (status queued); run → `done`.
   *   - `suggest` → the drafted bubbles are only LOGGED for a rep to approve; run
   *                 → `done`.
   *   - handoff signal (complaint / negotiation / credit habis / low confidence)
   *     → raises an escalation and finishes `escalated` — never an error.
   * A run with no linked conversation (or an empty thread) finishes `done` with an
   * honest "nothing to orchestrate" note (no fabricated steps). Any unexpected
   * failure finishes `error` with the message. Persisted via `updateRun` + the
   * run's `log` column.
   */
  async advanceRun(ctx: TenantContext, id: string): Promise<AutopilotRunRow> {
    const run = await this.getRun(ctx, id);
    if (run.status === "running")
      throw new ServiceError("Run sedang berjalan", 409, "already_running");
    if (run.status === "done" || run.status === "escalated")
      throw new ServiceError("Run sudah selesai — tidak bisa dijalankan lagi", 409, "already_finished");
    // queued | error → (re)start.

    // 1) Mark running (stamps started_at) + first log entry.
    await this.updateRun(ctx, id, {
      status: "running",
      logEntry: { step: "start", message: "Run dimulai — menyiapkan konteks." },
    });

    const entries: Record<string, unknown>[] = [];
    const add = (step: string, message: string, extra?: Record<string, unknown>) =>
      entries.push({ step, message, ...(extra ?? {}) });

    try {
      // ── No conversation: nothing to orchestrate (honest, no fabricated steps).
      if (!run.conversationId) {
        add("no-conversation", "Run tidak tertaut ke percakapan — tidak ada pesan untuk diorkestrasi.");
        const done = await this.updateRun(ctx, id, {
          status: "done",
          summary: "Run manual tanpa percakapan tertaut — tidak ada langkah AI yang dijalankan.",
          logEntries: entries,
        });
        await this.audit(ctx, "outreach.autopilot.advance", "autopilot_run", id, { status: "done" });
        return done;
      }

      // ── Load context: conversation → thread → contact → workspace tuning → stage.
      const conversation = await inboxService.getConversation(ctx, run.conversationId);
      const messages = await inboxService.listMessages(ctx, {
        conversationId: run.conversationId,
      });
      const history = messages.slice(-6).map((m) => ({
        role: m.direction === "in" ? ("customer" as const) : ("us" as const),
        text: m.body,
      }));
      // Reply to the latest INBOUND message; fall back to the conversation preview.
      const lastInbound = [...messages].reverse().find((m) => m.direction === "in");
      const message = lastInbound?.body ?? conversation.lastMessage ?? "";

      if (!message.trim()) {
        add("no-message", "Belum ada pesan masuk di percakapan ini untuk dibalas.");
        const done = await this.updateRun(ctx, id, {
          status: "done",
          summary: "Percakapan belum punya pesan masuk — tidak ada balasan yang disusun.",
          logEntries: entries,
        });
        await this.audit(ctx, "outreach.autopilot.advance", "autopilot_run", id, { status: "done" });
        return done;
      }

      // Contact name (best-effort — a WA-synced convo may carry a raw phone id).
      let contactName = "Pelanggan";
      try {
        const contact = await crmService.getContact(ctx, conversation.contactId);
        if (contact?.fullName) contactName = contact.fullName;
      } catch {
        contactName = conversation.contactId || "Pelanggan";
      }
      add("context", `Konteks siap: ${history.length} pesan terakhir, kontak "${contactName}".`);

      // Per-workspace tuning + persisted stage (lazy-load the AI stack so the
      // shared outreach service module doesn't pull it into every route).
      const { loadStage, saveStage } = await import("@/lib/sales/stage-store");
      const { loadMarketFit } = await import("@/lib/market-fit/store");
      const { loadSalesPlay } = await import("@/lib/sales-play/store");

      const wsId = conversation.workspaceId ?? run.workspaceId ?? undefined;
      let marketType: "B2B" | "B2C" | "mix" | undefined;
      let salesPlay: Awaited<ReturnType<typeof loadSalesPlay>> | undefined;
      if (wsId) {
        const mf = await loadMarketFit(wsId);
        marketType = mf?.marketType;
        salesPlay = (await loadSalesPlay(wsId)) ?? undefined;
      }
      const stage = await loadStage(run.conversationId);

      // ── BYOA (Fase 2): if the tenant runs its OWN agent, do NOT call the platform
      // LLM inline. Persist the context log so far, ENQUEUE a draft_reply task, and
      // leave the run RUNNING. The tenant's agent polls the queue, generates with
      // its own model, and POSTs the result back → agentTaskService.applyResult
      // appends the bubbles + finishes THIS run (auto → sends; suggest → draft).
      // `platform` mode (default) keeps the synchronous behavior below UNCHANGED.
      const { settingsService } = await import("@/modules/settings/service");
      if ((await settingsService.getAiMode(ctx)) === "byoa") {
        add(
          "byoa-queue",
          "Mode BYOA aktif — task draft_reply diantrekan untuk agent tenant. Run tetap berjalan sampai agent mengirim hasil.",
        );
        await this.updateRun(ctx, id, { logEntries: entries });
        const { agentTaskService } = await import("@/modules/agent-task/service");
        const task = await agentTaskService.enqueue(ctx, {
          type: "draft_reply",
          payload: {
            conversationId: run.conversationId,
            contactName,
            history,
            mode: run.mode,
            stage,
            marketType: marketType ?? null,
          },
          refType: "autopilot_run",
          refId: id,
        });
        await this.audit(ctx, "outreach.autopilot.advance", "autopilot_run", id, {
          status: "running",
          byoa: true,
          taskId: task.id,
        });
        return this.getRun(ctx, id); // stays "running" until the agent fulfills it
      }

      // ── The AI step (REUSED orchestrator — buildWaReply). It degrades to a
      // holding/handoff result on no-model/credit-habis, so it never throws.
      const { buildWaReply } = await import("@/lib/wa/orchestrator");
      const result = await buildWaReply(ctx, {
        contactName,
        message,
        history,
        stage,
        marketType,
        salesPlay: salesPlay ?? undefined,
      });
      await saveStage(run.conversationId, result.nextStage);
      add(
        "analyze",
        `Menganalisis percakapan — tahap ${result.nextStage}, kesiapan ${result.readiness.band} (${result.readiness.score}).`,
        {
          stage: result.nextStage,
          readinessScore: result.readiness.score,
          readinessBand: result.readiness.band,
          source: result.source,
        },
      );

      // ── Handoff signal → escalate, never auto-send (both modes).
      if (result.action === "handoff") {
        add("handoff", "AI meminta takeover manusia (komplain/negosiasi/kredit habis) — balasan tidak dikirim otomatis.");
        try {
          const esc = await this.createEscalation(ctx, {
            conversationId: run.conversationId,
            contactId: run.contactId ?? conversation.contactId ?? null,
            workspaceId: wsId ?? null,
            autopilotRunId: id,
            reason: "low_confidence",
            detail: "Autopilot meminta handoff otomatis.",
          });
          add("escalation", `Eskalasi dibuat (${esc.id}) — menunggu rep.`, { escalationId: esc.id });
        } catch {
          add("escalation", "Gagal membuat eskalasi otomatis — tetap perlu tinjauan manual.");
        }
        const escalated = await this.updateRun(ctx, id, {
          status: "escalated",
          summary: `AI meminta takeover manusia di tahap ${result.nextStage} — dieskalasi ke rep.`,
          logEntries: entries,
        });
        await this.audit(ctx, "outreach.autopilot.advance", "autopilot_run", id, { status: "escalated" });
        return escalated;
      }

      // ── Send/suggest branch: log each drafted bubble.
      result.bubbles.forEach((b, i) =>
        add("draft", `Bubble ${i + 1}: ${b.text}`, { bubble: i + 1, delayMs: b.delayMs }),
      );

      let summary: string;
      if (run.mode === "auto") {
        let sent = 0;
        for (const b of result.bubbles) {
          await inboxService.createMessage(ctx, {
            conversationId: run.conversationId,
            direction: "out",
            body: b.text,
            isAiGenerated: true,
            status: "queued",
          });
          sent++;
        }
        add("send", `${sent} balasan dikirim ke percakapan (mode Auto).`);
        summary = `AI membalas ${sent} bubble di tahap ${result.nextStage} (mode Auto).`;
      } else {
        add("suggest", `${result.bubbles.length} saran balasan dicatat untuk persetujuan rep (mode Saran).`);
        summary = `AI menyarankan ${result.bubbles.length} balasan di tahap ${result.nextStage} (mode Saran) — menunggu persetujuan.`;
      }

      const done = await this.updateRun(ctx, id, {
        status: "done",
        summary,
        logEntries: entries,
      });
      await this.audit(ctx, "outreach.autopilot.advance", "autopilot_run", id, { status: "done" });
      return done;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kesalahan tidak diketahui.";
      const errored = await this.updateRun(ctx, id, {
        status: "error",
        error: msg,
        logEntries: [...entries, { step: "error", message: `Run gagal: ${msg}` }],
      });
      await this.audit(ctx, "outreach.autopilot.advance", "autopilot_run", id, { status: "error" });
      return errored;
    }
  },

  async softDeleteRun(ctx: TenantContext, id: string): Promise<void> {
    const ok = await outreachRepo.softDeleteRun(ctx, id);
    if (!ok) throw new ServiceError("Autopilot run tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.autopilot.delete", "autopilot_run", id);
  },

  async restoreRun(ctx: TenantContext, id: string): Promise<AutopilotRunRow> {
    const ok = await outreachRepo.restoreRun(ctx, id);
    if (!ok) throw new ServiceError("Autopilot run tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "outreach.autopilot.restore", "autopilot_run", id);
    return this.getRun(ctx, id);
  },

  async hardDeleteRun(ctx: TenantContext, id: string): Promise<void> {
    const ok = await outreachRepo.hardDeleteRun(ctx, id);
    if (!ok) throw new ServiceError("Autopilot run tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.autopilot.purge", "autopilot_run", id);
  },

  // ═══════════════════════ escalation ═══════════════════════════════
  async listEscalations(
    ctx: TenantContext,
    filter?: { conversationId?: string; status?: string; assignedUserId?: string },
  ): Promise<EscalationRow[]> {
    if (filter?.status) assertEnum(filter.status, ESCALATION_STATUSES, "status");
    return outreachRepo.listEscalations(ctx, filter);
  },

  async listTrashedEscalations(ctx: TenantContext): Promise<EscalationRow[]> {
    return outreachRepo.listTrashedEscalations(ctx);
  },

  async getEscalation(ctx: TenantContext, id: string): Promise<EscalationRow> {
    const row = await outreachRepo.getEscalation(ctx, id);
    if (!row) throw new ServiceError("Escalation tidak ditemukan", 404, "not_found");
    return row;
  },

  /**
   * Raise an escalation for a conversation. Validates the conversation live
   * (inbox, owning module); if an OPEN escalation already exists for it, returns
   * that one (dedup) instead of stacking duplicates.
   */
  async createEscalation(
    ctx: TenantContext,
    input: CreateEscalationInput,
  ): Promise<EscalationRow> {
    const conversationId = input.conversationId?.trim();
    if (!conversationId) throw new ServiceError("conversation_id wajib diisi", 400, "validation");
    const conversation = await inboxService.getConversation(ctx, conversationId);
    const reason = assertEnum(input.reason, ESCALATION_REASONS, "reason");
    const priority = assertEnum(input.priority, PRIORITIES, "priority");

    const open = await outreachRepo.findOpenEscalation(ctx, conversationId);
    if (open) return open;

    const row = await outreachRepo.insertEscalation(ctx, {
      id: "esc_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      conversationId,
      contactId: input.contactId ?? conversation.contactId ?? null,
      workspaceId: input.workspaceId ?? conversation.workspaceId ?? null,
      autopilotRunId: input.autopilotRunId ?? null,
      reason,
      detail: input.detail ?? null,
      priority,
      status: "open",
      raisedBy: ctx.userId,
      assignedUserId: input.assignedUserId ?? conversation.assignedUserId ?? null,
    });
    await this.audit(ctx, "outreach.escalation.create", "escalation", row.id, {
      conversationId,
      reason,
    });
    // Persistent notification — tenant-wide (userId null) so any available rep can
    // pick up the handoff. Best-effort; never blocks raising the escalation.
    await notificationService.emit(ctx, {
      type: "escalation",
      title: "Eskalasi ke manusia",
      body: `Percakapan perlu ditinjau (${reason}).`,
      link: "/escalations",
      meta: { escalationId: row.id, conversationId, reason, priority },
    });
    return row;
  },

  async updateEscalation(
    ctx: TenantContext,
    id: string,
    input: UpdateEscalationInput,
  ): Promise<EscalationRow> {
    await this.getEscalation(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) {
      const status = assertEnum(input.status, ESCALATION_STATUSES, "status");
      patch.status = status;
      if (status === "acknowledged") patch.acknowledgedAt = new Date();
      if (status === "resolved" || status === "dismissed") patch.resolvedAt = new Date();
    }
    if (input.priority !== undefined)
      patch.priority = assertEnum(input.priority, PRIORITIES, "priority");
    for (const f of ["detail", "assignedUserId", "resolutionNote"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await outreachRepo.updateEscalation(ctx, id, patch);
    if (!row) throw new ServiceError("Escalation tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.escalation.update", "escalation", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  async softDeleteEscalation(ctx: TenantContext, id: string): Promise<void> {
    const ok = await outreachRepo.softDeleteEscalation(ctx, id);
    if (!ok) throw new ServiceError("Escalation tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.escalation.delete", "escalation", id);
  },

  async restoreEscalation(ctx: TenantContext, id: string): Promise<EscalationRow> {
    const ok = await outreachRepo.restoreEscalation(ctx, id);
    if (!ok) throw new ServiceError("Escalation tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "outreach.escalation.restore", "escalation", id);
    return this.getEscalation(ctx, id);
  },

  async hardDeleteEscalation(ctx: TenantContext, id: string): Promise<void> {
    const ok = await outreachRepo.hardDeleteEscalation(ctx, id);
    if (!ok) throw new ServiceError("Escalation tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.escalation.purge", "escalation", id);
  },

  // ═══════════════════════ handoff ══════════════════════════════════
  async listHandoffs(
    ctx: TenantContext,
    filter?: { conversationId?: string; status?: string; assignedUserId?: string },
  ): Promise<HandoffRow[]> {
    if (filter?.status) assertEnum(filter.status, HANDOFF_STATUSES, "status");
    return outreachRepo.listHandoffs(ctx, filter);
  },

  async listTrashedHandoffs(ctx: TenantContext): Promise<HandoffRow[]> {
    return outreachRepo.listTrashedHandoffs(ctx);
  },

  async getHandoff(ctx: TenantContext, id: string): Promise<HandoffRow> {
    const row = await outreachRepo.getHandoff(ctx, id);
    if (!row) throw new ServiceError("Handoff tidak ditemukan", 404, "not_found");
    return row;
  },

  /**
   * Queue a handoff for human takeover of a conversation. Validates the
   * conversation live (inbox, owning module) and, when supplied, the originating
   * escalation (this module).
   */
  async createHandoff(ctx: TenantContext, input: CreateHandoffInput): Promise<HandoffRow> {
    const conversationId = input.conversationId?.trim();
    if (!conversationId) throw new ServiceError("conversation_id wajib diisi", 400, "validation");
    const conversation = await inboxService.getConversation(ctx, conversationId);
    const priority = assertEnum(input.priority, PRIORITIES, "priority");
    if (input.escalationId) await this.getEscalation(ctx, input.escalationId);
    const dueAt = parseDate(input.dueAt, "due_at");

    const row = await outreachRepo.insertHandoff(ctx, {
      id: "hnd_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      conversationId,
      contactId: input.contactId ?? conversation.contactId ?? null,
      workspaceId: input.workspaceId ?? conversation.workspaceId ?? null,
      escalationId: input.escalationId ?? null,
      reason: input.reason ?? null,
      note: input.note ?? null,
      status: "pending",
      priority,
      assignedUserId: input.assignedUserId ?? conversation.assignedUserId ?? null,
      dueAt,
    });
    await this.audit(ctx, "outreach.handoff.create", "handoff", row.id, { conversationId });
    return row;
  },

  async updateHandoff(
    ctx: TenantContext,
    id: string,
    input: UpdateHandoffInput,
  ): Promise<HandoffRow> {
    await this.getHandoff(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.status !== undefined)
      patch.status = assertEnum(input.status, HANDOFF_STATUSES, "status");
    if (input.priority !== undefined)
      patch.priority = assertEnum(input.priority, PRIORITIES, "priority");
    if (input.dueAt !== undefined) patch.dueAt = parseDate(input.dueAt, "due_at");
    for (const f of ["note", "assignedUserId"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await outreachRepo.updateHandoff(ctx, id, patch);
    if (!row) throw new ServiceError("Handoff tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.handoff.update", "handoff", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  /** Claim a handoff (a human takes it off the queue). */
  async claimHandoff(ctx: TenantContext, id: string): Promise<HandoffRow> {
    const handoff = await this.getHandoff(ctx, id);
    if (handoff.status !== "pending") {
      throw new ServiceError("Handoff sudah tidak pending", 409, "not_pending");
    }
    const row = await outreachRepo.updateHandoff(ctx, id, {
      status: "claimed",
      claimedBy: ctx.userId,
      assignedUserId: handoff.assignedUserId ?? ctx.userId,
      claimedAt: new Date(),
    });
    if (!row) throw new ServiceError("Handoff tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.handoff.claim", "handoff", id);
    return row;
  },

  /** Mark a handoff done (the human finished the takeover). */
  async completeHandoff(ctx: TenantContext, id: string): Promise<HandoffRow> {
    await this.getHandoff(ctx, id);
    const row = await outreachRepo.updateHandoff(ctx, id, {
      status: "done",
      completedAt: new Date(),
    });
    if (!row) throw new ServiceError("Handoff tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.handoff.complete", "handoff", id);
    return row;
  },

  async softDeleteHandoff(ctx: TenantContext, id: string): Promise<void> {
    const ok = await outreachRepo.softDeleteHandoff(ctx, id);
    if (!ok) throw new ServiceError("Handoff tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.handoff.delete", "handoff", id);
  },

  async restoreHandoff(ctx: TenantContext, id: string): Promise<HandoffRow> {
    const ok = await outreachRepo.restoreHandoff(ctx, id);
    if (!ok) throw new ServiceError("Handoff tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "outreach.handoff.restore", "handoff", id);
    return this.getHandoff(ctx, id);
  },

  async hardDeleteHandoff(ctx: TenantContext, id: string): Promise<void> {
    const ok = await outreachRepo.hardDeleteHandoff(ctx, id);
    if (!ok) throw new ServiceError("Handoff tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "outreach.handoff.purge", "handoff", id);
  },

  // ═══════════════════════ internal helpers ═════════════════════════
  /** Write a tenant-scoped audit row for an outreach mutation. */
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
