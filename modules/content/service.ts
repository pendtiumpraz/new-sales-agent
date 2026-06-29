import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { contentRepo } from "./repo";
import type { ContentTemplateRow, ContentPlanRow } from "./schema";

/**
 * content domain service — message/content templates + content planning business
 * logic + validation + cross-module side effects (audit) + app-level cascade.
 * Routes stay thin: parse → call a method → wrap with the {ok,error} envelope.
 *
 * Owns two tables (content_template, content_plan). Referential integrity is
 * enforced HERE (app layer), never via DB FKs (none exist): a plan's optional
 * `template_id` is validated against a live template in THIS module before write.
 * Soft-delete/restore/purge of a template CASCADES to the plan items it sourced.
 *
 * Grain = TENANT: every method takes the caller's `TenantContext`; the repo scopes
 * all reads/writes to `ctx.tenantId` inside `withTenant`. Rows are additionally
 * scoped by `workspace_id` in-app (no FK).
 */

// ── enums ────────────────────────────────────────────────────────────────────
const CHANNELS = ["wa", "email", "instagram", "linkedin", "sms", "other"] as const;
const CATEGORIES = ["outreach", "nurture", "retention", "promo", "other"] as const;
const TEMPLATE_STATUSES = ["draft", "active", "archived"] as const;
const PLAN_STATUSES = ["idea", "planned", "scheduled", "published", "archived"] as const;

// ── input shapes ─────────────────────────────────────────────────────────────
export interface CreateTemplateInput {
  name: string;
  channel?: string;
  category?: string;
  subject?: string | null;
  body?: string;
  variables?: string[];
  tags?: string[];
  status?: string;
  workspaceId?: string | null;
}
export type UpdateTemplateInput = Partial<CreateTemplateInput>;

export interface CreatePlanInput {
  title: string;
  channel?: string;
  body?: string | null;
  status?: string;
  scheduledAt?: string | null;
  templateId?: string | null;
  workspaceId?: string | null;
  assignedUserId?: string | null;
  meta?: Record<string, unknown> | null;
}
export type UpdatePlanInput = Partial<CreatePlanInput>;

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

export const contentService = {
  // ═══════════════════════ content_template ═════════════════════════
  async listTemplates(
    ctx: TenantContext,
    filter?: { workspaceId?: string; channel?: string; category?: string; status?: string },
  ): Promise<ContentTemplateRow[]> {
    if (filter?.channel) assertEnum(filter.channel, CHANNELS, "channel");
    if (filter?.category) assertEnum(filter.category, CATEGORIES, "category");
    if (filter?.status) assertEnum(filter.status, TEMPLATE_STATUSES, "status");
    return contentRepo.listTemplates(ctx, filter);
  },

  async listTrashedTemplates(ctx: TenantContext): Promise<ContentTemplateRow[]> {
    return contentRepo.listTrashedTemplates(ctx);
  },

  async getTemplate(ctx: TenantContext, id: string): Promise<ContentTemplateRow> {
    const row = await contentRepo.getTemplate(ctx, id);
    if (!row) throw new ServiceError("Template tidak ditemukan", 404, "not_found");
    return row;
  },

  async createTemplate(
    ctx: TenantContext,
    input: CreateTemplateInput,
  ): Promise<ContentTemplateRow> {
    const name = input.name?.trim();
    if (!name) throw new ServiceError("Nama template wajib diisi", 400, "validation");
    const channel = assertEnum(input.channel, CHANNELS, "channel");
    const category = assertEnum(input.category, CATEGORIES, "category");
    const status = assertEnum(input.status, TEMPLATE_STATUSES, "status");

    const row = await contentRepo.insertTemplate(ctx, {
      id: "cnt_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      workspaceId: input.workspaceId ?? null,
      name,
      channel,
      category,
      subject: input.subject ?? null,
      body: input.body ?? "",
      variables: input.variables ?? [],
      tags: input.tags ?? [],
      status,
      usageCount: 0,
      createdBy: ctx.userId,
    });
    await this.audit(ctx, "content.template.create", "content_template", row.id, { channel });
    return row;
  },

  async updateTemplate(
    ctx: TenantContext,
    id: string,
    input: UpdateTemplateInput,
  ): Promise<ContentTemplateRow> {
    await this.getTemplate(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new ServiceError("Nama template wajib diisi", 400, "validation");
      patch.name = name;
    }
    if (input.channel !== undefined) patch.channel = assertEnum(input.channel, CHANNELS, "channel");
    if (input.category !== undefined)
      patch.category = assertEnum(input.category, CATEGORIES, "category");
    if (input.status !== undefined)
      patch.status = assertEnum(input.status, TEMPLATE_STATUSES, "status");
    for (const f of ["subject", "body", "variables", "tags", "workspaceId"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await contentRepo.updateTemplate(ctx, id, patch);
    if (!row) throw new ServiceError("Template tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "content.template.update", "content_template", id, {
      fields: Object.keys(patch),
    });
    return row;
  },

  async softDeleteTemplate(ctx: TenantContext, id: string): Promise<void> {
    const ok = await contentRepo.softDeleteTemplate(ctx, id);
    if (!ok) throw new ServiceError("Template tidak ditemukan", 404, "not_found");
    // App-level cascade: trash plan items that sourced this template.
    await contentRepo.setPlansDeletedByTemplate(ctx, id, true);
    await this.audit(ctx, "content.template.delete", "content_template", id);
  },

  async restoreTemplate(ctx: TenantContext, id: string): Promise<ContentTemplateRow> {
    const ok = await contentRepo.restoreTemplate(ctx, id);
    if (!ok) throw new ServiceError("Template tidak ada di trash", 404, "not_found");
    await contentRepo.setPlansDeletedByTemplate(ctx, id, false);
    await this.audit(ctx, "content.template.restore", "content_template", id);
    return this.getTemplate(ctx, id);
  },

  async hardDeleteTemplate(ctx: TenantContext, id: string): Promise<void> {
    const ok = await contentRepo.hardDeleteTemplate(ctx, id);
    if (!ok) throw new ServiceError("Template tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "content.template.purge", "content_template", id);
  },

  // ═══════════════════════ content_plan ═════════════════════════════
  async listPlans(
    ctx: TenantContext,
    filter?: { workspaceId?: string; templateId?: string; channel?: string; status?: string },
  ): Promise<ContentPlanRow[]> {
    if (filter?.channel) assertEnum(filter.channel, CHANNELS, "channel");
    if (filter?.status) assertEnum(filter.status, PLAN_STATUSES, "status");
    return contentRepo.listPlans(ctx, filter);
  },

  async listTrashedPlans(ctx: TenantContext): Promise<ContentPlanRow[]> {
    return contentRepo.listTrashedPlans(ctx);
  },

  async getPlan(ctx: TenantContext, id: string): Promise<ContentPlanRow> {
    const row = await contentRepo.getPlan(ctx, id);
    if (!row) throw new ServiceError("Item rencana konten tidak ditemukan", 404, "not_found");
    return row;
  },

  async createPlan(ctx: TenantContext, input: CreatePlanInput): Promise<ContentPlanRow> {
    const title = input.title?.trim();
    if (!title) throw new ServiceError("Judul rencana wajib diisi", 400, "validation");
    const channel = assertEnum(input.channel, CHANNELS, "channel");
    const status = assertEnum(input.status, PLAN_STATUSES, "status");
    const scheduledAt = parseDate(input.scheduledAt, "scheduled_at");
    // Integrity: an optional template_id must point at a live template (this module).
    if (input.templateId) await this.getTemplate(ctx, input.templateId);

    const row = await contentRepo.insertPlan(ctx, {
      id: "cpl_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      workspaceId: input.workspaceId ?? null,
      templateId: input.templateId ?? null,
      title,
      channel,
      body: input.body ?? null,
      status,
      scheduledAt,
      publishedAt: status === "published" ? new Date() : null,
      assignedUserId: input.assignedUserId ?? ctx.userId,
      meta: input.meta ?? null,
      createdBy: ctx.userId,
    });
    await this.audit(ctx, "content.plan.create", "content_plan", row.id, { channel, status });
    return row;
  },

  async updatePlan(
    ctx: TenantContext,
    id: string,
    input: UpdatePlanInput,
  ): Promise<ContentPlanRow> {
    await this.getPlan(ctx, id);
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) {
      const title = input.title?.trim();
      if (!title) throw new ServiceError("Judul rencana wajib diisi", 400, "validation");
      patch.title = title;
    }
    if (input.channel !== undefined) patch.channel = assertEnum(input.channel, CHANNELS, "channel");
    if (input.status !== undefined) {
      const status = assertEnum(input.status, PLAN_STATUSES, "status");
      patch.status = status;
      if (status === "published") patch.publishedAt = new Date();
    }
    if (input.scheduledAt !== undefined)
      patch.scheduledAt = parseDate(input.scheduledAt, "scheduled_at");
    if (input.templateId !== undefined) {
      if (input.templateId) await this.getTemplate(ctx, input.templateId);
      patch.templateId = input.templateId;
    }
    for (const f of ["body", "workspaceId", "assignedUserId", "meta"] as const) {
      if (input[f] !== undefined) patch[f] = input[f];
    }
    const row = await contentRepo.updatePlan(ctx, id, patch);
    if (!row) throw new ServiceError("Item rencana konten tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "content.plan.update", "content_plan", id, { fields: Object.keys(patch) });
    return row;
  },

  async softDeletePlan(ctx: TenantContext, id: string): Promise<void> {
    const ok = await contentRepo.softDeletePlan(ctx, id);
    if (!ok) throw new ServiceError("Item rencana konten tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "content.plan.delete", "content_plan", id);
  },

  async restorePlan(ctx: TenantContext, id: string): Promise<ContentPlanRow> {
    const ok = await contentRepo.restorePlan(ctx, id);
    if (!ok) throw new ServiceError("Item rencana konten tidak ada di trash", 404, "not_found");
    await this.audit(ctx, "content.plan.restore", "content_plan", id);
    return this.getPlan(ctx, id);
  },

  async hardDeletePlan(ctx: TenantContext, id: string): Promise<void> {
    const ok = await contentRepo.hardDeletePlan(ctx, id);
    if (!ok) throw new ServiceError("Item rencana konten tidak ditemukan", 404, "not_found");
    await this.audit(ctx, "content.plan.purge", "content_plan", id);
  },

  // ═══════════════════════ internal helpers ═════════════════════════
  /** Write a tenant-scoped audit row for a content mutation. */
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
