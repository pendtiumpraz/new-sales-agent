import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { tenantRepo } from "./repo";
import type { AppUserRow, MembershipRow, TenantRow, UsageCounterRow } from "./schema";

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
