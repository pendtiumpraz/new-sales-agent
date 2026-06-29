import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { hashPassword } from "@/modules/auth/password";
import { tenantService } from "@/modules/tenant/service";
import type { AppUserRow, TenantRow, UsageCounterRow } from "@/modules/tenant/schema";
import { platformRepo } from "./repo";
import type { AuditLogRow, PlatformSettingRow } from "./schema";

/**
 * superadmin domain service — the PLATFORM-level console.
 *
 * Scope (cross-tenant overview + provisioning):
 *  - `overview()`      — aggregate counts across ALL tenants/users (read).
 *  - `recentAudit()`   — the platform audit trail (optionally tenant-scoped).
 *  - settings k/v      — `listSettings/getSetting/setSetting` (platform_setting_v2).
 *  - `provisionTenant` — create a tenant + its FIRST admin user + owner membership
 *                        in one call, optionally with an activation window + a quota.
 *  - `createOperator`  — create a platform-staff (superadmin) app_user.
 *
 * OWNERSHIP: the superadmin domain owns ONLY `platform_setting_v2` + `audit_log_v2`
 * (via `platformRepo`). It NEVER writes `tenant`/`app_user`/`membership`/quota
 * directly — every such mutation goes through `tenantService` (modular-monolith
 * rule). Per-tenant lifecycle (activate/suspend/quota) already lives in the tenant
 * domain and is NOT re-exposed here; this service is provisioning + overview only.
 */

function targetCtx(tenantId: string, operatorUserId: string): TenantContext {
  return { tenantId, userId: operatorUserId, role: "superadmin" };
}

export interface PlatformOverview {
  tenants: { total: number; byStatus: Record<string, number> };
  users: { total: number; superadmins: number };
  auditEvents: number;
}

export interface ProvisionTenantInput {
  /** Workspace / company name → the tenant. */
  name: string;
  slug?: string;
  planKey?: string;
  verticalKey?: string;
  /** First admin account for the new tenant. */
  admin: {
    name: string;
    email: string;
    password: string;
  };
  /** Optional activation window — ISO date for the ceiling (null = no expiry). */
  activeUntil?: string | null;
  /** Optional starting quota ceilings (metric → limit; null = unlimited). */
  quotas?: Record<string, number | null>;
  /** When true, activate the tenant immediately (otherwise it stays `pending`). */
  activate?: boolean;
}

export interface ProvisionTenantResult {
  tenant: TenantRow;
  admin: AppUserRow;
}

export interface CreateOperatorInput {
  name: string;
  email: string;
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const superadminService = {
  /** Cross-tenant rollup for the platform console. */
  async overview(): Promise<PlatformOverview> {
    const [statusRows, totalUsers, superadmins, auditEvents] = await Promise.all([
      tenantService.countTenantsByStatus(),
      tenantService.countUsers(false),
      tenantService.countUsers(true),
      platformRepo.countAudit(null),
    ]);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of statusRows) {
      byStatus[row.status] = row.count;
      total += row.count;
    }

    return {
      tenants: { total, byStatus },
      users: { total: totalUsers, superadmins },
      auditEvents,
    };
  },

  /** Full cross-tenant tenant listing (active). Mirrors the tenant console list. */
  async listTenants(): Promise<TenantRow[]> {
    return tenantService.list();
  },

  /** All live app_users (platform directory). */
  async listUsers(): Promise<AppUserRow[]> {
    return tenantService.listUsers();
  },

  /** Recent audit events; pass a tenantId to scope, or null for platform-wide. */
  async recentAudit(tenantId: string | null, limit = 50): Promise<AuditLogRow[]> {
    return platformRepo.recentAudit(tenantId, limit);
  },

  // ── platform settings (global k/v) ───────────────────────────────
  async listSettings(): Promise<PlatformSettingRow[]> {
    return platformRepo.listSettings();
  },

  async getSetting(key: string): Promise<PlatformSettingRow> {
    const k = key?.trim();
    if (!k) throw new ServiceError("Key wajib diisi", 400, "validation");
    const row = await platformRepo.getSetting(k);
    if (!row) throw new ServiceError("Setelan tidak ditemukan", 404, "not_found");
    return row;
  },

  async setSetting(key: string, value: string, actorUserId?: string): Promise<PlatformSettingRow> {
    const k = key?.trim();
    if (!k) throw new ServiceError("Key wajib diisi", 400, "validation");
    if (value === undefined || value === null) {
      throw new ServiceError("Value wajib diisi", 400, "validation");
    }
    const row = await platformRepo.setSetting(k, String(value));
    await platformRepo.insertAudit({
      actorUserId: actorUserId ?? null,
      action: "platform.setting.update",
      targetType: "platform_setting",
      targetId: k,
      meta: { key: k },
    });
    return row;
  },

  /**
   * Provision a brand-new tenant together with its FIRST admin account in one
   * superadmin call. Steps (all via the owning tenant service):
   *   1) create tenant (→ pending)
   *   2) create the admin app_user (HASHED password)
   *   3) attach an owner membership
   *   4) optionally set quota ceilings
   *   5) optionally activate with an activation window
   *
   * The whole flow is audited under `platform.provision`.
   */
  async provisionTenant(
    input: ProvisionTenantInput,
    operatorUserId: string,
  ): Promise<ProvisionTenantResult> {
    const name = input.name?.trim();
    const adminName = input.admin?.name?.trim();
    const adminEmail = input.admin?.email?.trim().toLowerCase();
    const password = input.admin?.password ?? "";

    if (!name) throw new ServiceError("Nama tenant wajib diisi", 400, "validation");
    if (!adminName) throw new ServiceError("Nama admin wajib diisi", 400, "validation");
    if (!adminEmail || !EMAIL_RE.test(adminEmail)) {
      throw new ServiceError("Email admin tidak valid", 400, "validation");
    }
    if (password.length < 6) {
      throw new ServiceError("Sandi admin minimal 6 karakter", 400, "validation");
    }
    if (await tenantService.getUserByEmail(adminEmail)) {
      throw new ServiceError("Email admin sudah terdaftar", 409, "email_taken");
    }

    // 1) tenant → pending (tenant service stamps tenant.create audit + slug 409).
    const tenant = await tenantService.create(
      {
        name,
        slug: input.slug,
        planKey: input.planKey,
        verticalKey: input.verticalKey,
      },
      operatorUserId,
    );

    // 2) admin app_user with a hashed password (never plain text).
    const passwordHash = await hashPassword(password);
    const admin = await tenantService.createUser({
      name: adminName,
      email: adminEmail,
      passwordHash,
    });

    // 3) owner membership inside the new tenant's context.
    const ctx = targetCtx(tenant.id, operatorUserId);
    await tenantService.addMembership(ctx, admin.id, "tenant_owner", "active");

    // 4) optional starting quota ceilings.
    if (input.quotas) {
      for (const [metric, limit] of Object.entries(input.quotas)) {
        await tenantService.setQuota(ctx, metric, limit, "lifetime", operatorUserId);
      }
    }

    // 5) optional activation (sets status=active, active_until, activated_by/at).
    let finalTenant = tenant;
    if (input.activate || input.activeUntil) {
      finalTenant = await tenantService.activate(
        tenant.id,
        { until: input.activeUntil ?? null, planKey: input.planKey },
        operatorUserId,
      );
    }

    await platformRepo.insertAudit({
      tenantId: tenant.id,
      actorUserId: operatorUserId,
      action: "platform.provision",
      targetType: "tenant",
      targetId: tenant.id,
      meta: {
        adminEmail,
        activated: Boolean(input.activate || input.activeUntil),
        quotas: input.quotas ?? null,
      },
    });

    return { tenant: finalTenant, admin };
  },

  /**
   * Set / change a tenant's activation window + quota from the platform console.
   * A convenience wrapper that the superadmin overview uses; the underlying writes
   * are the tenant domain's `activate` + `setQuota` (no logic duplicated here).
   */
  async setActivationWindow(
    tenantId: string,
    input: { activeUntil?: string | null; planKey?: string; quotas?: Record<string, number | null> },
    operatorUserId: string,
  ): Promise<TenantRow> {
    const ctx = targetCtx(tenantId, operatorUserId);
    if (input.quotas) {
      for (const [metric, limit] of Object.entries(input.quotas)) {
        await tenantService.setQuota(ctx, metric, limit, "lifetime", operatorUserId);
      }
    }
    return tenantService.activate(
      tenantId,
      { until: input.activeUntil ?? null, planKey: input.planKey },
      operatorUserId,
    );
  },

  /** Create a platform-staff (superadmin) account. */
  async createOperator(input: CreateOperatorInput, operatorUserId: string): Promise<AppUserRow> {
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? "";
    if (!name) throw new ServiceError("Nama wajib diisi", 400, "validation");
    if (!email || !EMAIL_RE.test(email)) throw new ServiceError("Email tidak valid", 400, "validation");
    if (password.length < 6) throw new ServiceError("Sandi minimal 6 karakter", 400, "validation");

    const passwordHash = await hashPassword(password);
    const user = await tenantService.createUser({
      name,
      email,
      passwordHash,
      isSuperadmin: true,
    });

    await platformRepo.insertAudit({
      actorUserId: operatorUserId,
      action: "platform.operator.create",
      targetType: "app_user",
      targetId: user.id,
      meta: { email },
    });
    return user;
  },
};
