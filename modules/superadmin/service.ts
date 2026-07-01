import type { TenantContext } from "@/lib/db/tenant-context";

import { ServiceError } from "@/modules/_shared/api";
import { hashPassword } from "@/modules/auth/password";
import { tenantService } from "@/modules/tenant/service";
import type { AppUserRow, MembershipRow, TenantRow, UsageCounterRow } from "@/modules/tenant/schema";
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

/**
 * Service-level superadmin gate (audit #9/#29). Every cross-tenant method below
 * asserts the CALLER's verified context is a platform superadmin BEFORE touching
 * any unscoped read/write — defense-in-depth behind the route `platform.manage`
 * guard, so a future caller (a new route, an Inngest job, a composed service)
 * that forgets the route guard still can't leak all tenants. The `role` here is
 * resolved per-request from the session (and, post audit #7, re-validated against
 * the DB), so this is not the same stale-JWT trust the routes used to lean on.
 */
function assertSuperadmin(ctx: TenantContext): void {
  if (ctx.role !== "superadmin") {
    throw new ServiceError("Forbidden", 403, "forbidden");
  }
}

/**
 * Mint a cross-tenant `role:"superadmin"` context for `tenantId` so the platform
 * console can provision / activate ANY tenant. Audit #10: this is an RLS-bypass
 * token, so it must NOT be synthesized from a bare `tenantId` argument — the
 * caller must first PROVE it is acting as a superadmin by passing its own verified
 * `TenantContext` (which `assertSuperadmin` checks). `operatorUserId` is recorded
 * as the acting principal; it does not, by itself, confer the role.
 */
function targetCtx(
  callerCtx: TenantContext,
  tenantId: string,
  operatorUserId: string,
): TenantContext {
  assertSuperadmin(callerCtx);
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

// ── cross-tenant member management (superadmin console) ──────────────
// TENANT membership roles a superadmin may ASSIGN to a member. `superadmin` is a
// PLATFORM-staff flag on `app_user`, never a tenant role, so it is deliberately
// NOT assignable here (mirrors the tenant route's ASSIGNABLE_ROLES allow-list).
// The role CEILING that constrains a tenant admin does NOT apply — a superadmin
// outranks every tenant role and may set any of these.
const ASSIGNABLE_MEMBER_ROLES = ["member", "tenant_admin", "tenant_owner"] as const;
type MemberRole = (typeof ASSIGNABLE_MEMBER_ROLES)[number];
const MEMBER_STATUSES = ["active", "disabled"] as const;
type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** A member row assembled for the console: membership + resolved app_user fields. */
export interface TenantMemberView {
  id: string; // membership id (mbr_…)
  userId: string;
  role: string;
  status: string;
  name: string;
  email: string | null;
  avatarColor: string;
}

export interface AddTenantMemberInput {
  name: string;
  email: string;
  role: string;
  /** Optional plaintext password; when absent the service generates a strong one
   *  and returns it in the result so the operator can share it once. */
  password?: string;
}

export interface AddTenantMemberResult {
  member: TenantMemberView;
  /** The effective password for the freshly-created user, surfaced ONCE (this is
   *  the only time it is ever returned — the DB only stores the scrypt hash). */
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Disposable strong password for a console-provisioned member. */
function genMemberPassword(): string {
  return `Aa1!${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export const superadminService = {
  /** Cross-tenant rollup for the platform console. Superadmin-only (audit #9). */
  async overview(ctx: TenantContext): Promise<PlatformOverview> {
    assertSuperadmin(ctx);
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

  /** Full cross-tenant tenant listing (active). Mirrors the tenant console list.
   *  Superadmin-only (audit #9). */
  async listTenants(ctx: TenantContext): Promise<TenantRow[]> {
    assertSuperadmin(ctx);
    return tenantService.list();
  },

  /** All live app_users (platform directory). Superadmin-only (audit #9). */
  async listUsers(ctx: TenantContext): Promise<AppUserRow[]> {
    assertSuperadmin(ctx);
    return tenantService.listUsers();
  },

  /** Recent audit events; pass a tenantId to scope, or null for platform-wide.
   *  Superadmin-only (audit #9/#29): the null-tenant path reads ALL tenants on the
   *  unscoped db, so the service gate is the only thing standing in front of it. */
  async recentAudit(ctx: TenantContext, tenantId: string | null, limit = 50): Promise<AuditLogRow[]> {
    assertSuperadmin(ctx);
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
    ctx: TenantContext,
    input: ProvisionTenantInput,
    operatorUserId: string,
  ): Promise<ProvisionTenantResult> {
    assertSuperadmin(ctx);
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
    const newTenantCtx = targetCtx(ctx, tenant.id, operatorUserId);
    await tenantService.addMembership(newTenantCtx, admin.id, "tenant_owner", "active");

    // 4) optional starting quota ceilings.
    if (input.quotas) {
      for (const [metric, limit] of Object.entries(input.quotas)) {
        await tenantService.setQuota(newTenantCtx, metric, limit, "lifetime", operatorUserId);
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
    ctx: TenantContext,
    tenantId: string,
    input: { activeUntil?: string | null; planKey?: string; quotas?: Record<string, number | null> },
    operatorUserId: string,
  ): Promise<TenantRow> {
    assertSuperadmin(ctx);
    const targetTenantCtx = targetCtx(ctx, tenantId, operatorUserId);
    if (input.quotas) {
      for (const [metric, limit] of Object.entries(input.quotas)) {
        await tenantService.setQuota(targetTenantCtx, metric, limit, "lifetime", operatorUserId);
      }
    }
    return tenantService.activate(
      tenantId,
      { until: input.activeUntil ?? null, planKey: input.planKey },
      operatorUserId,
    );
  },

  // ── cross-tenant member management ──────────────────────────────────
  // The console manages the MEMBERS of any tenant, not just its lifecycle. Each
  // method proves superadmin (assertSuperadmin + targetCtx), then delegates the
  // membership/app_user writes to the owning tenant service (modular-monolith
  // ownership rule — the superadmin domain writes only audit_log_v2).

  /** List a target tenant's live members with resolved name/email/avatar. */
  async listTenantMembers(ctx: TenantContext, tenantId: string): Promise<TenantMemberView[]> {
    assertSuperadmin(ctx);
    const tctx = targetCtx(ctx, tenantId, ctx.userId);
    const rows = await tenantService.listMemberships(tctx);
    return Promise.all(
      rows.map(async (m): Promise<TenantMemberView> => {
        const u = await tenantService.getUserById(m.userId);
        return {
          id: m.id,
          userId: m.userId,
          role: m.role,
          status: m.status,
          name: u?.name ?? m.userId,
          email: u?.email ?? null,
          avatarColor: u?.avatarColor ?? "#94a3b8",
        };
      }),
    );
  },

  /**
   * Add a member to a target tenant. Creates the app_user (409 if the email is
   * already taken), attaches an active membership with the requested role, and
   * surfaces the generated password ONCE. The tenant service's `addMembership`
   * seat-quota check is preserved (throws 402 at the seat ceiling).
   */
  async addTenantMember(
    ctx: TenantContext,
    tenantId: string,
    input: AddTenantMemberInput,
    operatorUserId: string,
  ): Promise<AddTenantMemberResult> {
    assertSuperadmin(ctx);
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    const role = input.role?.trim();
    if (!name) throw new ServiceError("Nama wajib diisi", 400, "validation");
    if (!email || !EMAIL_RE.test(email)) throw new ServiceError("Email tidak valid", 400, "validation");
    if (!ASSIGNABLE_MEMBER_ROLES.includes(role as MemberRole)) {
      throw new ServiceError("Role tidak valid", 400, "invalid_role");
    }
    if (await tenantService.getUserByEmail(email)) {
      throw new ServiceError("Email sudah terdaftar", 409, "email_taken");
    }

    // targetCtx proves superadmin BEFORE we create anything.
    const tctx = targetCtx(ctx, tenantId, operatorUserId);
    const password =
      input.password && input.password.length >= 6 ? input.password : genMemberPassword();
    const passwordHash = await hashPassword(password);
    const user = await tenantService.createUser({ name, email, passwordHash });
    // addMembership keeps the seat-quota guard; may throw 402 (leaves the user with
    // no membership — same shape as provisionTenant's create-then-attach flow).
    const membership = await tenantService.addMembership(tctx, user.id, role!, "active");

    await platformRepo.insertAudit({
      tenantId,
      actorUserId: operatorUserId,
      action: "platform.member.add",
      targetType: "membership",
      targetId: membership.id,
      meta: { email, role },
    });

    return {
      member: {
        id: membership.id,
        userId: user.id,
        role: membership.role,
        status: membership.status,
        name: user.name,
        email: user.email,
        avatarColor: user.avatarColor ?? "#94a3b8",
      },
      password,
    };
  },

  /**
   * Change a target tenant member's role and/or seat status. Validates role ∈
   * {member,tenant_admin,tenant_owner} and status ∈ {active,disabled}. No role
   * ceiling — a superadmin outranks every tenant role.
   */
  async updateTenantMember(
    ctx: TenantContext,
    tenantId: string,
    membershipId: string,
    patch: { role?: string; status?: string },
    operatorUserId: string,
  ): Promise<MembershipRow> {
    assertSuperadmin(ctx);
    const clean: { role?: string; status?: string } = {};
    if (patch.role !== undefined) {
      if (!ASSIGNABLE_MEMBER_ROLES.includes(patch.role as MemberRole)) {
        throw new ServiceError("Role tidak valid", 400, "invalid_role");
      }
      clean.role = patch.role;
    }
    if (patch.status !== undefined) {
      if (!MEMBER_STATUSES.includes(patch.status as MemberStatus)) {
        throw new ServiceError("Status tidak valid", 400, "validation");
      }
      clean.status = patch.status;
    }
    if (clean.role === undefined && clean.status === undefined) {
      throw new ServiceError("Role atau status wajib diisi", 400, "validation");
    }

    const tctx = targetCtx(ctx, tenantId, operatorUserId);
    const row = await tenantService.updateMembership(tctx, membershipId, clean);

    await platformRepo.insertAudit({
      tenantId,
      actorUserId: operatorUserId,
      action: "platform.member.update",
      targetType: "membership",
      targetId: membershipId,
      meta: clean,
    });
    return row;
  },

  /** Remove a member from a target tenant (hard delete of the membership). */
  async removeTenantMember(
    ctx: TenantContext,
    tenantId: string,
    membershipId: string,
    operatorUserId: string,
  ): Promise<void> {
    assertSuperadmin(ctx);
    const tctx = targetCtx(ctx, tenantId, operatorUserId);
    await tenantService.removeMembership(tctx, membershipId);

    await platformRepo.insertAudit({
      tenantId,
      actorUserId: operatorUserId,
      action: "platform.member.remove",
      targetType: "membership",
      targetId: membershipId,
    });
  },

  /** Create a platform-staff (superadmin) account. Superadmin-only (audit #9):
   *  this mints a new principal with full platform access, so it must be gated at
   *  the service layer too, not only at the route. */
  async createOperator(
    ctx: TenantContext,
    input: CreateOperatorInput,
    operatorUserId: string,
  ): Promise<AppUserRow> {
    assertSuperadmin(ctx);
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
