import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { retentionRepo } from "./repo";
import type { RetentionFlowRow, RetentionStepRow } from "./schema";

/**
 * retention domain service — retention / win-back flow + step business logic +
 * validation + cross-module side effects (audit) + app-level cascade. Routes stay
 * thin: parse → call a method → wrap with the {ok,error} envelope.
 *
 * Owns two tables (retention_flow, retention_step). Referential integrity is
 * enforced HERE (app layer), never via DB FKs (none exist): a step's `flow_id` is
 * validated against a live flow in THIS module before write. Soft-delete/restore/
 * purge of a flow CASCADES to its steps in the app layer.
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo scopes
 * all reads/writes to `ctx.tenantId` inside `withTenant`.
 */

// ── enums ────────────────────────────────────────────────────────────────────
const FLOW_KINDS = ["retention", "win_back", "onboarding", "loyalty"] as const;
const SEGMENTS = ["b2c", "b2b", "all"] as const;
const FLOW_STATUSES = ["active", "paused", "archived"] as const;
const STEP_CHANNELS = ["wa", "email", "call", "sms"] as const;

// ── input shapes ─────────────────────────────────────────────────────────────
export interface CreateFlowInput {
  name: string;
  description?: string | null;
  kind?: string;
  trigger?: string;
  segment?: string;
  status?: string;
  workspaceId?: string | null;
}
export type UpdateFlowInput = Partial<CreateFlowInput>;

export interface CreateStepInput {
  flowId: string;
  channel?: string;
  delayDays?: number;
  subject?: string | null;
  template?: string;
  offer?: string | null;
  sort?: number;
  meta?: Record<string, unknown> | null;
}
export type UpdateStepInput = Partial<Omit<CreateStepInput, "flowId">>;

// ── validation helpers ───────────────────────────────────────────────────────
function assertEnum(value: string | undefined, allowed: readonly string[], field: string): string {
  const v = value ?? allowed[0];
  if (!allowed.includes(v)) {
    throw new ServiceError(`${field} harus salah satu dari: ${allowed.join(", ")}`, 400, "validation");
  }
  return v;
}

export const retentionService = {
  // ═══════════════════════ retention_flow ═══════════════════════════
  async listFlows(
    ctx: TenantContext,
    filter?: { workspaceId?: string; kind?: string; status?: string },
  ): Promise<RetentionFlowRow[]> {
    if (filter?.kind) assertEnum(filter.kind, FLOW_KINDS, "kind");
    if (filter?.status) assertEnum(filter.status, FLOW_STATUSES, "status");
    return retentionRepo.listFlows(ctx, filter);
  },

  async listTrashedFlows(ctx: TenantContext): Promise<RetentionFlowRow[]> {
    return retentionRepo.listTrashedFlows(ctx);
  },

  async getFlow(ctx: TenantContext, id: string): Promise<RetentionFlowRow> {
    const row = await retentionRepo.getFlow(ctx, id);
    if (!row) throw new ServiceError("Flow retensi tidak ditemukan", 404, "not_found");
    return row;
  },

  async createFlow(ctx: TenantContext, input: CreateFlowInput): Promise<RetentionFlowRow> {
    const name = input.name?.trim();
    if (!name) throw new ServiceError("Nama flow wajib diisi", 400, "validation");
    const kind = assertEnum(input.kind, FLOW_KINDS, "kind");
    const segment = assertEnum(input.segment, SEGMENTS, "segment");
    const status = assertEnum(input.status, FLOW_STATUSES, "status");

    const row = await retentionRepo.insertFlow(ctx, {
      id: "rfl_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      workspaceId: input.workspaceId ?? null,
      name,
      description: input.description ?? null,
      kind,
      trigger: input.trigger?.trim() || "manual",
      segment,
      status,
      stepCount: 0,
      createdBy: ctx.userId,
    });
    await this.audit(ctx, "retention.flow.create", "retention_flow", row.id, { kind });
    return row;
  },

  async updateFlow(
    ctx: TenantContext,
    id: string,
    input: UpdateFlowInput,
  ): Promise<RetentionFlowRow> {
    await this.getFlow(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new ServiceError("Nama flow wajib diisi", 400, "validation");
      patch.name = name;
    }
    if (input.kind !== undefined) patch.kind = assertEnum(input.kind, FLOW_KINDS, "kind");
    if (input.segment !== undefined) patch.segment = assertEnum(input.segment, SEGMENTS, "segment");
    if (input.status !== undefined)
      patch.status = assertEnum(input.status, FLOW_STATUSES, "status");
    for (const f of ["description", "trigger", "workspaceId"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await retentionRepo.updateFlow(ctx, id, patch);
    if (!row) throw new ServiceError("Flow retensi tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "retention.flow.update", "retention_flow", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  async softDeleteFlow(ctx: TenantContext, id: string): Promise<void> {
    const ok = await retentionRepo.softDeleteFlow(ctx, id);
    if (!ok) throw new ServiceError("Flow retensi tidak ditemukan", 404, "not_found");
    await retentionRepo.setStepsDeletedByFlow(ctx, id, true);
    await this.audit(ctx, "retention.flow.delete", "retention_flow", id);
  },

  async restoreFlow(ctx: TenantContext, id: string): Promise<RetentionFlowRow> {
    const ok = await retentionRepo.restoreFlow(ctx, id);
    if (!ok) throw new ServiceError("Flow retensi tidak ada di trash", 404, "not_found");
    await retentionRepo.setStepsDeletedByFlow(ctx, id, false);
    await this.audit(ctx, "retention.flow.restore", "retention_flow", id);
    return this.getFlow(ctx, id);
  },

  async hardDeleteFlow(ctx: TenantContext, id: string): Promise<void> {
    const ok = await retentionRepo.hardDeleteFlow(ctx, id);
    if (!ok) throw new ServiceError("Flow retensi tidak ditemukan", 404, "not_found");
    await retentionRepo.hardDeleteStepsByFlow(ctx, id);
    await this.audit(ctx, "retention.flow.purge", "retention_flow", id);
  },

  // ═══════════════════════ retention_step ═══════════════════════════
  async listSteps(ctx: TenantContext, flowId: string): Promise<RetentionStepRow[]> {
    await this.getFlow(ctx, flowId);
    return retentionRepo.listSteps(ctx, flowId);
  },

  async listTrashedSteps(ctx: TenantContext): Promise<RetentionStepRow[]> {
    return retentionRepo.listTrashedSteps(ctx);
  },

  async getStep(ctx: TenantContext, id: string): Promise<RetentionStepRow> {
    const row = await retentionRepo.getStep(ctx, id);
    if (!row) throw new ServiceError("Step retensi tidak ditemukan", 404, "not_found");
    return row;
  },

  async createStep(ctx: TenantContext, input: CreateStepInput): Promise<RetentionStepRow> {
    const flowId = input.flowId?.trim();
    if (!flowId) throw new ServiceError("flow_id wajib diisi", 400, "validation");
    // Integrity: a step must belong to a live flow in this tenant.
    await this.getFlow(ctx, flowId);
    const channel = assertEnum(input.channel, STEP_CHANNELS, "channel");
    const delayDays = Math.max(0, Math.trunc(input.delayDays ?? 0));
    // Default the order to the end of the flow when no explicit sort is given.
    const sort = input.sort ?? (await retentionRepo.countSteps(ctx, flowId));

    const row = await retentionRepo.insertStep(ctx, {
      id: "rst_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      flowId,
      sort,
      channel,
      delayDays,
      subject: input.subject ?? null,
      template: input.template ?? "",
      offer: input.offer ?? null,
      meta: input.meta ?? null,
    });
    await this.syncStepCount(ctx, flowId);
    await this.audit(ctx, "retention.step.create", "retention_step", row.id, { flowId, channel });
    return row;
  },

  async updateStep(
    ctx: TenantContext,
    id: string,
    input: UpdateStepInput,
  ): Promise<RetentionStepRow> {
    await this.getStep(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.channel !== undefined)
      patch.channel = assertEnum(input.channel, STEP_CHANNELS, "channel");
    if (input.delayDays !== undefined) patch.delayDays = Math.max(0, Math.trunc(input.delayDays));
    for (const f of ["subject", "template", "offer", "sort", "meta"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await retentionRepo.updateStep(ctx, id, patch);
    if (!row) throw new ServiceError("Step retensi tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "retention.step.update", "retention_step", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  async softDeleteStep(ctx: TenantContext, id: string): Promise<void> {
    const step = await retentionRepo.getStep(ctx, id);
    const ok = await retentionRepo.softDeleteStep(ctx, id);
    if (!ok) throw new ServiceError("Step retensi tidak ditemukan", 404, "not_found");
    if (step) await this.syncStepCount(ctx, step.flowId);
    await this.audit(ctx, "retention.step.delete", "retention_step", id);
  },

  async restoreStep(ctx: TenantContext, id: string): Promise<RetentionStepRow> {
    const ok = await retentionRepo.restoreStep(ctx, id);
    if (!ok) throw new ServiceError("Step retensi tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "retention.step.restore", "retention_step", id);
    const row = await this.getStep(ctx, id);
    await this.syncStepCount(ctx, row.flowId);
    return row;
  },

  async hardDeleteStep(ctx: TenantContext, id: string): Promise<void> {
    const step = await retentionRepo.getStep(ctx, id);
    const ok = await retentionRepo.hardDeleteStep(ctx, id);
    if (!ok) throw new ServiceError("Step retensi tidak ditemukan", 404, "not_found");
    if (step) await this.syncStepCount(ctx, step.flowId);
    await this.audit(ctx, "retention.step.purge", "retention_step", id);
  },

  /** Recompute + persist the flow's denormalized `step_count`. */
  async syncStepCount(ctx: TenantContext, flowId: string): Promise<void> {
    const count = await retentionRepo.countSteps(ctx, flowId);
    await retentionRepo.updateFlow(ctx, flowId, { stepCount: count });
  },

  // ═══════════════════════ internal helpers ═════════════════════════
  /** Write a tenant-scoped audit row for a retention mutation. */
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
