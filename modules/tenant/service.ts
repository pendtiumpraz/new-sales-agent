import type { TenantContext } from "@/lib/db/tenant-context";
import {
  resolvePlanLimits,
  metricPeriod,
  QUOTA_METRICS,
  MONTHLY_METRICS,
  METRIC_LABEL,
  DAILY_CAP_METRICS,
  resolveDailyCap,
  dayPeriod,
  type QuotaMetric,
} from "@/lib/billing/plans";
import { packByKey } from "@/lib/billing/quota-packs";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { tenantRepo } from "./repo";
import type { AppUserRow, MembershipRow, TenantRow, UsageCounterRow, QuotaGrantRow } from "./schema";

export interface QuotaSummaryEntry {
  metric: QuotaMetric;
  label: string;
  used: number;
  limit: number | null; // plan limit + active packs; null = unlimited
  grant?: number; // extra from active packs (present when > 0)
  dailyUsed?: number; // messages / AI only
  dailyCap?: number | null;
}

/**
 * tenant domain service — the REFERENCE implementation for the rebuild.
 * Holds ALL business logic + cross-module side effects (audit). Routes stay
 * thin: parse → call a service method → wrap with the {ok,error} envelope.
 *
 * Soft-delete + restore are first-class. Referential integrity / cascade is
 * enforced HERE (app layer), never via DB FKs (none exist).
 */

const TENANT_STATUSES = ["pending", "active", "suspended", "expired"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export interface CreateTenantInput {
  name: string;
  slug?: string;
  planKey?: string;
  verticalKey?: string;
}

export interface ActivateTenantInput {
  /** ISO date string for the activation ceiling; null/undefined = no expiry. */
  until?: string | null;
  planKey?: string;
}

export const tenantService = {
  /** Cross-tenant list for the superadmin console (active tenants only). */
  async list(): Promise<TenantRow[]> {
    return tenantRepo.listTenants();
  },

  /** Soft-deleted tenants (the trash view). */
  async listTrashed(): Promise<TenantRow[]> {
    return tenantRepo.listTrashedTenants();
  },

  async get(id: string): Promise<TenantRow> {
    const row = await tenantRepo.getTenant(id);
    if (!row) throw new ServiceError("Tenant not found", 404, "not_found");
    return row;
  },

  /**
   * Public register / superadmin create. Lands at status='pending' until a
   * superadmin activates it. Slug uniqueness is enforced app-side (no FK/unique
   * race handling beyond the DB unique index, which we surface as a 409).
   */
  async create(input: CreateTenantInput, actorUserId?: string): Promise<TenantRow> {
    const name = input.name?.trim();
    if (!name) throw new ServiceError("Nama tenant wajib diisi", 400, "validation");

    const slug = (input.slug?.trim() || slugify(name)) || `tnt-${Date.now()}`;
    const existing = await tenantRepo.getTenantBySlug(slug);
    if (existing) throw new ServiceError("Slug sudah dipakai", 409, "slug_taken");

    const row = await tenantRepo.insertTenant({
      id: "tnt_" + crypto.randomUUID(),
      name,
      slug,
      status: "pending",
      planKey: input.planKey ?? null,
      verticalKey: input.verticalKey ?? null,
    });

    await platformRepo.insertAudit({
      tenantId: row.id,
      actorUserId: actorUserId ?? null,
      action: "tenant.create",
      targetType: "tenant",
      targetId: row.id,
      meta: { slug, planKey: input.planKey ?? null },
    });
    return row;
  },

  /**
   * Activate a (pending/expired) tenant with an optional duration + plan.
   * Sets status='active', active_until, activated_by/at. Superadmin-only
   * (the route guards `platform.manage`).
   */
  async activate(id: string, input: ActivateTenantInput, actorUserId: string): Promise<TenantRow> {
    await this.get(id); // 404s if missing/deleted
    let until: Date | null = null;
    if (input.until) {
      until = new Date(input.until);
      if (Number.isNaN(until.getTime())) {
        throw new ServiceError("Tanggal aktivasi tidak valid", 400, "validation");
      }
    }
    const row = await tenantRepo.updateTenant(id, {
      status: "active",
      activeUntil: until,
      activatedBy: actorUserId,
      activatedAt: new Date(),
      ...(input.planKey ? { planKey: input.planKey } : {}),
    });
    if (!row) throw new ServiceError("Tenant not found", 404, "not_found");

    // Mirror the (new) plan's quota ceilings into usage_counter so the quota UI +
    // extension heartbeat show the right limits (enforcement itself reads the plan).
    await this.applyPlanQuotas({ tenantId: id, userId: actorUserId, role: "superadmin" }, row.planKey ?? null);

    await platformRepo.insertAudit({
      tenantId: id,
      actorUserId,
      action: "tenant.activate",
      targetType: "tenant",
      targetId: id,
      meta: { until: input.until ?? null, planKey: input.planKey ?? null },
    });
    return row;
  },

  /** Suspend an active tenant (kill-switch). */
  async suspend(id: string, actorUserId: string): Promise<TenantRow> {
    await this.get(id);
    const row = await tenantRepo.updateTenant(id, { status: "suspended" });
    if (!row) throw new ServiceError("Tenant not found", 404, "not_found");
    await platformRepo.insertAudit({
      tenantId: id,
      actorUserId,
      action: "tenant.suspend",
      targetType: "tenant",
      targetId: id,
    });
    return row;
  },

  /** Mark onboarding complete (gate to dashboard). */
  async completeOnboarding(id: string): Promise<TenantRow> {
    await this.get(id);
    const row = await tenantRepo.updateTenant(id, { onboardingCompletedAt: new Date() });
    if (!row) throw new ServiceError("Tenant not found", 404, "not_found");
    return row;
  },

  // ── Users + memberships (tenant domain owns app_user / membership) ──
  // The auth domain calls these (instead of reaching into tenantRepo) so the
  // identity tables stay owned by exactly one module.

  async getUserById(id: string): Promise<AppUserRow | undefined> {
    return tenantRepo.getUserById(id);
  },

  async getUserByEmail(email: string): Promise<AppUserRow | undefined> {
    return tenantRepo.getUserByEmail(email);
  },

  /** Cross-tenant reads the superadmin console composes (it owns no tables —
   *  the tenant domain owns `tenant`/`app_user`, so it reads through here). */
  async listUsers(): Promise<AppUserRow[]> {
    return tenantRepo.listUsers();
  },

  async countUsers(superadminOnly = false): Promise<number> {
    return tenantRepo.countUsers(superadminOnly);
  },

  async countTenantsByStatus(): Promise<{ status: string; count: number }[]> {
    return tenantRepo.countTenantsByStatus();
  },

  /** Create a global app_user with an already-hashed password. */
  async createUser(input: {
    name: string;
    email: string;
    passwordHash: string;
    avatarColor?: string | null;
    isSuperadmin?: boolean;
  }): Promise<AppUserRow> {
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    if (!name) throw new ServiceError("Nama wajib diisi", 400, "validation");
    if (!email) throw new ServiceError("Email wajib diisi", 400, "validation");
    if (await tenantRepo.getUserByEmail(email)) {
      throw new ServiceError("Email sudah terdaftar", 409, "email_taken");
    }
    return tenantRepo.insertUser({
      id: "usr_" + crypto.randomUUID(),
      name,
      email,
      passwordHash: input.passwordHash,
      avatarColor: input.avatarColor ?? null,
      isSuperadmin: input.isSuperadmin ?? false,
    });
  },

  /** Replace a user's password hash (used after a verified reset). */
  async setUserPasswordHash(userId: string, passwordHash: string): Promise<AppUserRow> {
    const row = await tenantRepo.updateUser(userId, { passwordHash });
    if (!row) throw new ServiceError("Pengguna tidak ditemukan", 404, "not_found");
    return row;
  },

  /** Stamp last_login_at after a successful credential verify. */
  async markLogin(userId: string): Promise<void> {
    await tenantRepo.updateUser(userId, { lastLoginAt: new Date() });
  },

  /** Add a membership (tenant-scoped). Idempotent on the (tenant,user) pair. */
  async addMembership(
    ctx: TenantContext,
    userId: string,
    role: string,
    status = "active",
  ): Promise<MembershipRow> {
    const existing = await tenantRepo.getMembership(ctx, userId);
    if (existing) return existing;
    // Seat quota — count-derived (no drift on member removal). Block a NEW member
    // if the tenant is at its plan's seat ceiling. null seats = unlimited.
    const tenant = await tenantRepo.getTenant(ctx.tenantId);
    const seatLimit = resolvePlanLimits(tenant?.planKey ?? null).seats_max;
    if (seatLimit !== null) {
      const current = await tenantRepo.countActiveMembers(ctx);
      if (current >= seatLimit) {
        throw new ServiceError(
          `Kuota ${METRIC_LABEL.seats_max} tercapai (${current}/${seatLimit}). Upgrade paket atau hubungi admin.`,
          402,
          "quota_exceeded",
        );
      }
    }
    return tenantRepo.insertMembership(ctx, {
      id: "mbr_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      userId,
      role,
      status,
    });
  },

  /** Resolve a user's first/primary membership (drives tenant + role at login). */
  async firstMembership(userId: string): Promise<MembershipRow | undefined> {
    return tenantRepo.firstMembershipForUser(userId);
  },

  /** List the tenant's live memberships. The tenant domain owns `membership`, so
   *  other modules (e.g. settings' team facade) read it through here rather than
   *  reaching into `tenantRepo`/the table directly. */
  async listMemberships(ctx: TenantContext): Promise<MembershipRow[]> {
    return tenantRepo.listMemberships(ctx);
  },

  /** Change a member's role and/or seat status (tenant-scoped). 404s when the
   *  membership isn't found in this tenant. Role/status VALIDATION is the caller's
   *  job (the tenant + superadmin routes each enforce their own allow-list). */
  async updateMembership(
    ctx: TenantContext,
    membershipId: string,
    patch: { role?: string; status?: string },
  ): Promise<MembershipRow> {
    const row = await tenantRepo.updateMembership(ctx, membershipId, patch);
    if (!row) throw new ServiceError("Anggota tidak ditemukan", 404, "not_found");
    return row;
  },

  /** Remove a member from the tenant (hard delete of the membership row). 404s
   *  when nothing matched in this tenant. */
  async removeMembership(ctx: TenantContext, membershipId: string): Promise<void> {
    const removed = await tenantRepo.deleteMembership(ctx, membershipId);
    if (!removed) throw new ServiceError("Anggota tidak ditemukan", 404, "not_found");
  },

  // ── Quota (grain = tenant) ───────────────────────────────────────
  async listQuota(ctx: TenantContext): Promise<UsageCounterRow[]> {
    return tenantRepo.listUsage(ctx);
  },

  /**
   * Set/override a quota ceiling for a metric. period defaults to 'lifetime'
   * for count metrics; pass a 'YYYY-MM' bucket for period metrics.
   */
  async setQuota(
    ctx: TenantContext,
    metric: string,
    limit: number | null,
    period = "lifetime",
    actorUserId?: string,
  ): Promise<UsageCounterRow> {
    if (!metric.trim()) throw new ServiceError("Metric wajib diisi", 400, "validation");
    if (limit !== null && (!Number.isFinite(limit) || limit < 0)) {
      throw new ServiceError("Limit tidak valid", 400, "validation");
    }
    const row = await tenantRepo.upsertUsage(ctx, metric, period, { quotaLimit: limit });
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: actorUserId ?? ctx.userId,
      action: "tenant.quota.update",
      targetType: "usage_counter",
      targetId: row.id,
      meta: { metric, period, limit },
    });
    return row;
  },

  /**
   * Action-level quota guard. Returns true if `delta` more of `metric` is allowed.
   * Lifetime metrics compare against current usage; null limit = unlimited.
   */
  async checkQuota(
    ctx: TenantContext,
    metric: string,
    delta = 1,
    period = "lifetime",
  ): Promise<{ allowed: boolean; used: number; limit: number | null }> {
    const row = await tenantRepo.getUsage(ctx, metric, period);
    const used = row?.used ?? 0;
    const limit = row?.quotaLimit ?? null;
    const allowed = limit === null || used + delta <= limit;
    return { allowed, used, limit };
  },

  /**
   * Enforce a quota metric BEFORE an action. Resolves the ceiling from the
   * tenant's PLAN (source of truth; null = unlimited) and compares against the
   * per-period `used` counter. Throws 402 `quota_exceeded` when the action would
   * exceed it. Unknown/unset plan → unlimited (fail-open) so unplanned tenants
   * never block. Callers that hold their own key (BYOK) skip the AI metric.
   */
  /**
   * Evaluate whether `delta` more of a metric is allowed — checks BOTH the monthly/
   * lifetime effective ceiling (plan limit + active top-up packs) AND the per-day cap
   * (messages / AI). Returns the FIRST limit that would be exceeded. Packs lift the
   * monthly/lifetime ceiling but NOT the daily cap (that stays a fixed rate limit).
   */
  async evalQuota(
    ctx: TenantContext,
    metric: QuotaMetric,
    delta = 1,
  ): Promise<{ ok: boolean; scope: "day" | "month" | "total"; used: number; limit: number }> {
    const tenant = await tenantRepo.getTenant(ctx.tenantId);
    const planKey = tenant?.planKey ?? null;
    const planLimit = resolvePlanLimits(planKey)[metric];
    const period = metricPeriod(metric);
    const periodRow = await tenantRepo.getUsage(ctx, metric, period);
    const used = periodRow?.used ?? 0;
    // Per-tenant OVERRIDE set from the superadmin console (setQuota writes
    // usage_counter.quota_limit). Honor it whether it was written on the metric's
    // period or on 'lifetime' (setQuota's default) — this is what makes the "Kuota
    // Token AI" field + "+ Kredit" actually ENFORCE (before, evalQuota read only
    // plan+grants, so a plan-less tenant stayed unlimited no matter what was typed).
    // Override replaces the plan base; active top-up packs (grants) still stack.
    let override = periodRow?.quotaLimit ?? null;
    if (override === null && period !== "lifetime") {
      override = (await tenantRepo.getUsage(ctx, metric, "lifetime"))?.quotaLimit ?? null;
    }
    const base = override ?? planLimit;
    if (base !== null) {
      const grants = await tenantRepo.sumActiveGrants(ctx, metric);
      const limit = base + grants;
      if (used + delta > limit) {
        return { ok: false, scope: MONTHLY_METRICS.includes(metric) ? "month" : "total", used, limit };
      }
    }
    const dailyCap = resolveDailyCap(planKey, metric);
    if (dailyCap !== null) {
      const dused = (await tenantRepo.getUsage(ctx, metric, dayPeriod()))?.used ?? 0;
      if (dused + delta > dailyCap) return { ok: false, scope: "day", used: dused, limit: dailyCap };
    }
    return { ok: true, scope: "total", used: 0, limit: -1 };
  },

  async enforceQuota(ctx: TenantContext, metric: QuotaMetric, delta = 1): Promise<void> {
    const r = await this.evalQuota(ctx, metric, delta);
    if (!r.ok) {
      const per = r.scope === "day" ? " (hari ini)" : r.scope === "month" ? " (bulan ini)" : "";
      throw new ServiceError(
        `Kuota ${METRIC_LABEL[metric]}${per} tercapai (${r.used}/${r.limit}). Upgrade paket atau beli tambahan.`,
        402,
        "quota_exceeded",
      );
    }
  },

  /** Non-throwing sibling — for paths that must degrade gracefully (e.g. WA auto-reply). */
  async canConsume(ctx: TenantContext, metric: QuotaMetric, delta = 1): Promise<boolean> {
    return (await this.evalQuota(ctx, metric, delta)).ok;
  },

  /** Record consumption (AFTER success). Bumps the monthly/lifetime counter, and for
   *  daily-capped metrics (messages / AI) the per-day counter too. */
  async bumpUsage(ctx: TenantContext, metric: QuotaMetric, delta = 1): Promise<void> {
    if (!delta) return;
    await tenantRepo.incrementUsage(ctx, metric, metricPeriod(metric), delta);
    if (DAILY_CAP_METRICS.includes(metric)) {
      await tenantRepo.incrementUsage(ctx, metric, dayPeriod(), delta);
    }
  },

  /**
   * Mirror the tenant's plan ceilings into usage_counter.quota_limit per metric
   * (unlimited → null). Enforcement reads the plan directly; this cache is for the
   * quota UI + the extension heartbeat to show used/limit. Called on activation.
   */
  async applyPlanQuotas(ctx: TenantContext, planKey: string | null): Promise<void> {
    const limits = resolvePlanLimits(planKey);
    for (const metric of QUOTA_METRICS) {
      await tenantRepo.upsertUsage(ctx, metric, metricPeriod(metric), { quotaLimit: limits[metric] });
    }
  },

  /**
   * Resolved used/limit per metric (limit from the PLAN, used from usage_counter's
   * current period). Drives the quota UI + the extension heartbeat so the rep sees
   * the same numbers the platform enforces. Seats `used` is the live member count.
   */
  async quotaSummary(ctx: TenantContext): Promise<QuotaSummaryEntry[]> {
    const tenant = await tenantRepo.getTenant(ctx.tenantId);
    const planKey = tenant?.planKey ?? null;
    const planLimits = resolvePlanLimits(planKey);
    const out: QuotaSummaryEntry[] = [];
    for (const metric of QUOTA_METRICS) {
      const used =
        metric === "seats_max"
          ? await tenantRepo.countActiveMembers(ctx)
          : (await tenantRepo.getUsage(ctx, metric, metricPeriod(metric)))?.used ?? 0;
      const planLimit = planLimits[metric];
      const grant = planLimit === null ? 0 : await tenantRepo.sumActiveGrants(ctx, metric);
      const entry: QuotaSummaryEntry = {
        metric,
        label: METRIC_LABEL[metric],
        used,
        limit: planLimit === null ? null : planLimit + grant,
        grant: grant || undefined,
      };
      if (DAILY_CAP_METRICS.includes(metric)) {
        entry.dailyCap = resolveDailyCap(planKey, metric);
        entry.dailyUsed = (await tenantRepo.getUsage(ctx, metric, dayPeriod()))?.used ?? 0;
      }
      out.push(entry);
    }
    return out;
  },

  // ── Top-up packs (quota_grant) ───────────────────────────────────
  /** Grant a top-up pack (superadmin or a self-serve purchase). days>0 → expires. */
  async grantQuota(
    ctx: TenantContext,
    input: {
      metric: QuotaMetric;
      amount: number;
      days?: number | null;
      source?: string;
      provider?: string | null;
      externalRef?: string | null;
      note?: string | null;
      status?: string; // "active" (default) | "pending" (gateway checkout awaiting payment)
    },
    actorUserId?: string,
  ): Promise<QuotaGrantRow> {
    if (!QUOTA_METRICS.includes(input.metric)) throw new ServiceError("Metric tidak valid", 400, "validation");
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ServiceError("Jumlah harus > 0", 400, "validation");
    // A pending (unpaid) grant has NO expiry yet — the webhook sets it on activation.
    const status = input.status ?? "active";
    const expiresAt =
      status !== "pending" && input.days && input.days > 0
        ? new Date(Date.now() + input.days * 86_400_000)
        : null;
    const row = await tenantRepo.insertQuotaGrant(ctx, {
      id: "qg_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      metric: input.metric,
      amount: Math.floor(input.amount),
      source: input.source ?? "superadmin",
      provider: input.provider ?? null,
      externalRef: input.externalRef ?? null,
      status,
      note: input.note ?? null,
      expiresAt,
    });
    await platformRepo.insertAudit({
      tenantId: ctx.tenantId,
      actorUserId: actorUserId ?? ctx.userId,
      action: "tenant.quota.grant",
      targetType: "quota_grant",
      targetId: row.id,
      meta: { metric: input.metric, amount: input.amount, days: input.days ?? null, source: row.source, provider: row.provider },
    });
    return row;
  },

  async listQuotaGrants(ctx: TenantContext): Promise<QuotaGrantRow[]> {
    return tenantRepo.listActiveGrants(ctx);
  },

  /** Webhook: activate a pending purchase grant by its gateway order id. Idempotent
   *  (gateways retry) — a second call on an already-active grant is a no-op. The
   *  30-day (or pack) validity starts NOW, at payment, not at checkout creation. */
  async activatePurchase(orderId: string): Promise<QuotaGrantRow | null> {
    const grant = await tenantRepo.findGrantByExternalRef(orderId);
    if (!grant) return null;
    if (grant.status === "active") return grant;
    const days = (grant.note ? packByKey(grant.note)?.days : undefined) ?? 30;
    const expiresAt = new Date(Date.now() + days * 86_400_000);
    await tenantRepo.activateGrant(grant.id, expiresAt);
    await platformRepo.insertAudit({
      tenantId: grant.tenantId,
      actorUserId: "system",
      action: "tenant.quota.purchase.activate",
      targetType: "quota_grant",
      targetId: grant.id,
      meta: { orderId, metric: grant.metric, amount: grant.amount, provider: grant.provider },
    });
    return { ...grant, status: "active", expiresAt };
  },

  // ── Soft delete + restore ────────────────────────────────────────
  async softDelete(id: string, actorUserId?: string): Promise<void> {
    const ok = await tenantRepo.softDeleteTenant(id);
    if (!ok) throw new ServiceError("Tenant not found", 404, "not_found");
    // NOTE: app-level cascade (memberships, theme, entitlements, …) is handled by
    // the owning module services when each domain lands; tenant rows are the root.
    await platformRepo.insertAudit({
      tenantId: id,
      actorUserId: actorUserId ?? null,
      action: "tenant.delete",
      targetType: "tenant",
      targetId: id,
    });
  },

  async restore(id: string, actorUserId?: string): Promise<TenantRow> {
    const ok = await tenantRepo.restoreTenant(id);
    if (!ok) throw new ServiceError("Tenant tidak ada di trash", 404, "not_found");
    await platformRepo.insertAudit({
      tenantId: id,
      actorUserId: actorUserId ?? null,
      action: "tenant.restore",
      targetType: "tenant",
      targetId: id,
    });
    return this.get(id);
  },

  /**
   * HARD delete (purge) — PERMANENTLY removes the tenant row (real SQL delete),
   * not a soft `deleted_at` stamp. Irreversible; meant for the superadmin "purge
   * from trash" action. We stamp the audit row AFTER the delete (audit_log_v2 is a
   * separate, FK-less table, so the trail survives the purge). App-level cascade of
   * owned child rows is handled by each owning module service as those domains land.
   */
  async hardDelete(id: string, actorUserId?: string): Promise<void> {
    const ok = await tenantRepo.hardDeleteTenant(id);
    if (!ok) throw new ServiceError("Tenant not found", 404, "not_found");
    await platformRepo.insertAudit({
      tenantId: id,
      actorUserId: actorUserId ?? null,
      action: "tenant.purge",
      targetType: "tenant",
      targetId: id,
    });
  },
};
