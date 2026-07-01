import { randomBytes } from "node:crypto";

import type { TenantContext } from "@/lib/db/tenant-context";
import { isDemoMode } from "@/lib/auth/dev-gate";

import { membershipRole } from "@/lib/rbac/permissions";
import type { Role } from "@/lib/rbac/permissions";

import { ServiceError } from "@/modules/_shared/api";
import { platformRepo } from "@/modules/superadmin/repo";
import { tenantService } from "@/modules/tenant/service";
import type { AppUserRow, MembershipRow } from "@/modules/tenant/schema";
import type { AuthSessionRow } from "./schema";
import { authRepo } from "./repo";
import { hashPassword, verifyPassword } from "./password";

/**
 * auth domain service — registration, the next-auth credential hook, password
 * reset, and revocable-session management. Business logic + cross-module side
 * effects live here; routes stay thin.
 *
 * OWNERSHIP: identity tables (`app_user`, `tenant`, `membership`) belong to the
 * tenant domain, so this service goes through `tenantService` for every user /
 * membership / tenant read+write (modular-monolith rule). It only touches its own
 * `auth_session` / `password_reset` tables via `authRepo`. Sessions remain
 * next-auth (JWT); these records are the persistent augmentation a JWT can't hold.
 */

const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour
const AVATAR_COLORS = ["#FD7A5C", "#14B8A6", "#F59E0B", "#3B82F6", "#8B5CF6"];

function avatarFor(email: string): string {
  return AVATAR_COLORS[email.length % AVATAR_COLORS.length];
}

export interface RegisterInput {
  /** Company / workspace name → the tenant. */
  company: string;
  /** Person's name → the owner user. */
  name: string;
  email: string;
  password: string;
}

export interface RegisterResult {
  tenantId: string;
  userId: string;
  status: string; // tenant status — always 'pending' at registration
}

export interface VerifiedCredential {
  user: AppUserRow;
  membership: MembershipRow | null; // null for an INDEPENDENT superadmin (no tenant)
}

/**
 * The freshly re-resolved authorization-critical fields for a request principal
 * (audit #7). `revoked` is true ONLY when the user has session rows on record and
 * none are active — so the absence of any session row (the current login reality)
 * never trips it. `null` from `resolvePrincipal` means "couldn't re-resolve"
 * (unknown user / DB error) → callers fall back to the JWT claims (fail-open).
 */
export interface ResolvedPrincipal {
  role: Role;
  isSuperadmin: boolean;
  revoked: boolean;
}

export const authService = {
  /**
   * Self-serve signup (doc §4.2 `POST /api/auth/register`). Creates a tenant in
   * status='pending', the owner user (HASHED password), and an owner membership.
   * The account cannot use the app until a superadmin activates the tenant.
   */
  async register(input: RegisterInput): Promise<RegisterResult> {
    const company = input.company?.trim();
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? "";

    if (!company || company.length < 2) {
      throw new ServiceError("Nama perusahaan minimal 2 karakter", 400, "validation");
    }
    if (!name || name.length < 2) {
      throw new ServiceError("Nama minimal 2 karakter", 400, "validation");
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ServiceError("Email tidak valid", 400, "validation");
    }
    if (password.length < 6) {
      throw new ServiceError("Sandi minimal 6 karakter", 400, "validation");
    }
    if (await tenantService.getUserByEmail(email)) {
      throw new ServiceError("Email sudah terdaftar", 409, "email_taken");
    }

    // 1) tenant → pending (tenant service stamps the audit row).
    const tenant = await tenantService.create({ name: company });

    // 2) owner user with a hashed password (never plain text).
    const passwordHash = await hashPassword(password);
    const user = await tenantService.createUser({
      name,
      email,
      passwordHash,
      avatarColor: avatarFor(email),
    });

    // 3) owner membership inside the new tenant context.
    const ctx: TenantContext = { tenantId: tenant.id, userId: user.id, role: "tenant_owner" };
    await tenantService.addMembership(ctx, user.id, "tenant_owner", "active");

    await platformRepo.insertAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "auth.register",
      targetType: "app_user",
      targetId: user.id,
      meta: { email, company },
    });

    return { tenantId: tenant.id, userId: user.id, status: tenant.status };
  },

  /**
   * Credential verify hook for the next-auth Credentials provider. Resolves the
   * user by email, checks the hashed password, then maps to the primary tenant +
   * role via membership. Returns null on any failure so next-auth surfaces a
   * generic credentials error (no user-enumeration leak). Stamps last_login_at.
   */
  async verifyCredentials(email: string, password: string): Promise<VerifiedCredential | null> {
    const normalized = email?.trim().toLowerCase();
    if (!normalized || !password) return null;

    const user = await tenantService.getUserByEmail(normalized);
    if (!user) return null;
    if (!(await verifyPassword(password, user.passwordHash))) return null;

    // Superadmin is INDEPENDENT — not tied to (nor allowed in) any tenant/team, so
    // no membership is required. A regular user MUST resolve to a tenant.
    const membership = await tenantService.firstMembership(user.id);
    if (!membership && !user.isSuperadmin) return null;

    await tenantService.markLogin(user.id);
    return { user, membership: membership ?? null };
  },

  /**
   * Begin a password reset. Always resolves (no user-enumeration); the token is
   * only persisted when the email maps to a real user. The token is delivered
   * OUT-OF-BAND (email in a real deployment) and is NEVER returned to the caller
   * — returning it would be a one-request account-takeover oracle (audit #2).
   * Until a mailer exists, the token is logged server-side ONLY behind the
   * demo/non-prod gate so a developer can still complete the flow locally.
   */
  async requestReset(email: string): Promise<{ requested: true }> {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) throw new ServiceError("Email wajib diisi", 400, "validation");

    const user = await tenantService.getUserByEmail(normalized);
    if (!user) return { requested: true }; // silent — do not reveal existence

    const token = randomBytes(32).toString("hex");
    await authRepo.insertReset({
      id: "prs_" + crypto.randomUUID(),
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    await platformRepo.insertAudit({
      actorUserId: user.id,
      action: "auth.password_reset.request",
      targetType: "app_user",
      targetId: user.id,
    });
    // Dev-only convenience: surface the token in server logs so the flow is
    // testable without a mailer. NEVER returned to the client and NEVER logged
    // in production (gate = mock provider AND non-prod build).
    if (isDemoMode()) {
      console.info(`[auth] password reset token for ${normalized}: ${token}`);
    }
    return { requested: true };
  },

  /**
   * Complete a password reset: validate the one-shot token (unused + unexpired),
   * set the new HASHED password, and consume the token. Each step is atomic at
   * the row level (markResetUsed only matches an unused token).
   */
  async confirmReset(token: string, newPassword: string): Promise<{ ok: true }> {
    if (!token?.trim()) throw new ServiceError("Token wajib diisi", 400, "validation");
    if (!newPassword || newPassword.length < 6) {
      throw new ServiceError("Sandi minimal 6 karakter", 400, "validation");
    }

    const reset = await authRepo.getUnusedReset(token);
    if (!reset) throw new ServiceError("Token tidak valid atau sudah dipakai", 400, "invalid_token");
    if (reset.expiresAt && reset.expiresAt.getTime() < Date.now()) {
      throw new ServiceError("Token kadaluarsa", 400, "expired_token");
    }

    const passwordHash = await hashPassword(newPassword);
    await tenantService.setUserPasswordHash(reset.userId, passwordHash);

    const consumed = await authRepo.markResetUsed(reset.id);
    if (!consumed) throw new ServiceError("Token sudah dipakai", 409, "token_used");

    await platformRepo.insertAudit({
      actorUserId: reset.userId,
      action: "auth.password_reset.confirm",
      targetType: "app_user",
      targetId: reset.userId,
    });
    return { ok: true };
  },

  /**
   * Re-resolve a principal's authorization-critical fields from the DB on the
   * REQUEST hot path (audit #7) so a JWT minted at login can't be trusted forever:
   * a demoted user, a flipped `is_superadmin`, or a "log out everywhere" revoke
   * takes effect on the very next request instead of waiting for the token to
   * expire. Returns `null` when the user can't be resolved (deleted / no DB row)
   * so the caller can decide its fallback. Conservative by construction — it only
   * ever DOWNGRADES (it reads the live role/flag; it never invents elevation).
   *
   * `revoked` is absence-tolerant: true only when the user HAS session rows and
   * none are usable. With no session rows (login does not call `recordSession`
   * yet) it stays false, so normal sessions keep working.
   */
  async resolvePrincipal(userId: string): Promise<ResolvedPrincipal | null> {
    const user = await tenantService.getUserById(userId);
    if (!user) return null; // unknown/deleted user → caller falls back to JWT

    const membership = await tenantService.firstMembership(userId);
    const role = membershipRole(membership?.role ?? "member", user.isSuperadmin);

    const totalSessions = await authRepo.countSessionsForUser(userId);
    let revoked = false;
    if (totalSessions > 0) {
      revoked = !(await authRepo.hasActiveSession(userId));
    }

    return { role, isSuperadmin: user.isSuperadmin, revoked };
  },

  // ── Revocable sessions (augment the JWT) ─────────────────────────
  async listSessions(userId: string): Promise<AuthSessionRow[]> {
    return authRepo.listSessionsForUser(userId);
  },

  async recordSession(input: {
    userId: string;
    activeTenantId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    expiresAt?: Date | null;
  }): Promise<AuthSessionRow> {
    return authRepo.insertSession({
      id: "ses_" + crypto.randomUUID(),
      userId: input.userId,
      activeTenantId: input.activeTenantId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt: input.expiresAt ?? null,
    });
  },

  /**
   * Revoke a session. The caller may only revoke their OWN sessions (the route
   * passes the session-holder's userId); a mismatch 404s rather than leaking.
   */
  async revokeSession(id: string, requesterUserId: string): Promise<void> {
    const row = await authRepo.getSession(id);
    if (!row || row.userId !== requesterUserId) {
      throw new ServiceError("Sesi tidak ditemukan", 404, "not_found");
    }
    const revoked = await authRepo.revokeSession(id);
    if (!revoked) throw new ServiceError("Sesi sudah dicabut", 409, "already_revoked");
    await platformRepo.insertAudit({
      actorUserId: requesterUserId,
      action: "auth.session.revoke",
      targetType: "auth_session",
      targetId: id,
    });
  },

  /**
   * Retention sweep (audit #51): hard-delete spent rows from the two append-only
   * auth tables — revoked/expired `auth_session` rows and used/expired
   * `password_reset` tokens — that nothing else ever purges, so they grow
   * unbounded. `olderThan` (default now) is the expiry cutoff. Idempotent and
   * safe to run repeatedly; returns how many of each were removed.
   *
   * INVOCATION: there is no scheduler wired yet. A daily cron / Inngest job is the
   * intended trigger — e.g. an Inngest scheduled function (`lib/inngest/`) or a
   * Vercel Cron route that simply calls `authService.purgeExpired()`. Until then a
   * superadmin can invoke it manually.
   */
  async purgeExpired(olderThan: Date = new Date()): Promise<{ sessions: number; resets: number }> {
    const sessions = await authRepo.purgeExpiredSessions(olderThan);
    const resets = await authRepo.purgeExpiredResets(olderThan);
    return { sessions, resets };
  },
};
