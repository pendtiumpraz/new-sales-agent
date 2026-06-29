import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { findAccount } from "./demo-accounts";
import { isDemoMode } from "./dev-gate";
import { rateLimit, clientIp } from "./rate-limit";
import { mapDemoRole, type Role } from "@/lib/rbac/permissions";
import { hasDb } from "@/lib/db/client";
import { authService } from "@/modules/auth/service";
import { tenantService } from "@/modules/tenant/service";
import { authConfig } from "./auth.config";

// Auth.js v5 — Credentials provider wired to the REBUILD auth domain
// (Sainskerta Loop Phase 04, doc 06). Authorization order:
//   1) Real users in the NEW `app_user` / `membership` / `tenant` tables, verified
//      against `app_user.password_hash` (scrypt) via authService.verifyCredentials.
//   2) Offline demo accounts (no Postgres) so the prototype still boots with no DB.
// JWT strategy is required for the Credentials provider; the persistent
// `auth_session` table augments (not replaces) the stateless JWT.
const DEFAULT_TENANT_ID = "t_default";

/**
 * Map a `membership.role` value (`tenant_owner|tenant_admin|sales_manager|
 * sales_rep`) onto a canonical RBAC `Role` (`superadmin|tenant_owner|
 * tenant_admin|member`). `is_superadmin` on the user overrides everything.
 */
function membershipRole(role: string, isSuperadmin: boolean): Role {
  if (isSuperadmin) return "superadmin";
  switch (role) {
    case "tenant_owner":
      return "tenant_owner";
    case "tenant_admin":
      return "tenant_admin";
    case "sales_manager":
    case "sales_rep":
    default:
      return "member";
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (creds, req) => {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        const password = String(creds?.password ?? "");

        // Rate-limit credential attempts by IP AND by email (audit #8) so an
        // attacker can't brute-force passwords against a real account. Returning
        // null surfaces a generic "wrong credentials" — same shape as a miss, so
        // no oracle. The `req` here is a Fetch Request (Auth.js v5).
        const ip = req instanceof Request ? clientIp(req) : "unknown";
        const rlIp = rateLimit("login-ip", ip, 30, 15 * 60 * 1000); // 30/15min/IP
        const rlEmail = email
          ? rateLimit("login-email", email, 10, 15 * 60 * 1000) // 10/15min/email
          : { ok: true, retryAfter: 0 };
        if (!rlIp.ok || !rlEmail.ok) return null;

        // 1) Real users in the NEW auth domain. verifyCredentials checks the
        //    scrypt password hash and resolves the primary membership + tenant.
        //    Authorization succeeds even when the tenant is pending/suspended/
        //    expired — the app shell gates that and routes to /pending; this keeps
        //    a legible "wrong password" vs "not activated" distinction.
        if (hasDb()) {
          const verified = await authService.verifyCredentials(email, password);
          if (verified) {
            const { user, membership } = verified;
            const tenant = await tenantService.get(membership.tenantId).catch(() => null);
            return {
              id: user.id,
              name: user.name,
              email: user.email,
              role: membershipRole(membership.role, user.isSuperadmin),
              tenantId: membership.tenantId,
              isSuperadmin: user.isSuperadmin,
              tenantStatus: tenant?.status ?? "pending",
              avatarColor: user.avatarColor ?? undefined,
            };
          }
        }

        // 2) Offline demo accounts — always on t_default (no DB required).
        //    GATED (audit #1): only reachable in the demo/non-prod build
        //    (`isDemoMode()` = mock provider AND NODE_ENV !== "production"), so
        //    this branch is GUARANTEED dead in a real deployment and can never
        //    be an auth bypass. The demo set also contains no Superadmin record,
        //    so a hardcoded credential can never mint platform access.
        if (isDemoMode()) {
          const account = findAccount(email, password);
          if (account) {
            return {
              id: account.id,
              name: account.name,
              email: account.email,
              role: mapDemoRole(account.role),
              tenantId: DEFAULT_TENANT_ID,
              isSuperadmin: false, // never elevate from a hardcoded record
              tenantStatus: "active",
              avatarColor: account.avatarColor,
              demoRole: account.role,
              scope: account.scope,
            };
          }
        }

        return null;
      },
    }),
  ],
});
