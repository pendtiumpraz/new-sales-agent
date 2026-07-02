import { headers } from "next/headers";

import { auth } from "./auth";
import { hasDb } from "@/lib/db/client";
import type { TenantContext } from "@/lib/db/tenant-context";

/** `Bearer msk_…` → the raw API key, else null. Only the `msk_` prefix triggers
 *  the API-key path; any other Authorization value falls through to the session. */
function apiKeyBearer(): string | null {
  try {
    const authz = headers().get("authorization");
    if (!authz) return null;
    const m = /^Bearer\s+(msk_\S+)$/.exec(authz.trim());
    return m ? m[1] : null;
  } catch {
    // headers() outside a request scope — treat as "no header".
    return null;
  }
}

/**
 * Resolve the RLS/tenant context from the Auth.js session for a route handler
 * (doc 19). Returns null when there's no session — callers fall back to
 * mock/seed, mirroring the existing `!hasDb()` branch.
 *
 * Per-request re-validation (audit #7): the JWT copies `role`/`isSuperadmin` once
 * at login and would otherwise be trusted until it expires. Here, whenever a DB is
 * present, we RE-RESOLVE the live role + `is_superadmin` from `app_user` +
 * membership and reject a request whose sessions have all been revoked
 * ("log out everywhere"). This is deliberately CONSERVATIVE:
 *   - It only ever DOWNGRADES privilege (reads the live role/flag; never elevates
 *     beyond what the DB says).
 *   - It FAILS OPEN: any re-resolve error (or no matching user row) keeps the JWT
 *     claims, so a transient DB glitch never logs a real user out — same posture
 *     as the tenant-status gate in `lib/rbac/guard.ts`.
 *   - Revocation is absence-tolerant (see `authService.resolvePrincipal`): login
 *     does not write `auth_session` rows yet, so "no rows" is treated as "not
 *     revoked" and normal sessions are unaffected.
 *
 * This module is imported only from Node-runtime route handlers (the edge
 * middleware uses `authConfig` callbacks directly), so the DB import is safe here.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  // ── API-key (BYOA) path — checked BEFORE the session, so an external agent can
  // authenticate with `Authorization: Bearer msk_…`. The key itself identifies the
  // tenant; there is no NextAuth session. A key never carries superadmin, and its
  // scope is stamped on `apiKeyScope` for `requirePermission` to enforce.
  const bearer = apiKeyBearer();
  if (bearer) {
    // A Bearer msk_ header is PRESENT → this request is an API-key request. It must
    // resolve to a valid live key or it is unauthorized (null → 401) — we do NOT
    // fall back to the session path for a present-but-invalid key.
    if (!hasDb()) return null;
    try {
      const { apiKeyService } = await import("@/modules/apikey/service");
      const resolved = await apiKeyService.resolveKey(bearer);
      if (!resolved) return null;

      // Live role of the key's user (never superadmin via a key). resolvePrincipal
      // only ever DOWNGRADES and is cached; we FORCE isSuperadmin:false and coerce a
      // superadmin role down to a tenant floor so a key can never carry platform
      // privilege (defense-in-depth on top of the requirePermission scope gate).
      const { authService } = await import("@/modules/auth/service");
      const principal = await authService.resolvePrincipal(resolved.userId);
      let role = principal?.role ?? "member";
      if (role === "superadmin") role = "member";

      return {
        tenantId: resolved.tenantId,
        userId: resolved.userId,
        role,
        isSuperadmin: false,
        apiKeyScope: resolved.scope,
      };
    } catch (err) {
      // A resolution error is NOT an auth bypass — reject rather than fall through.
      console.error("[session-context] API key resolve failed", err);
      return null;
    }
  }

  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  // Superadmin is INDEPENDENT — no tenant. Every other user needs a tenant.
  const isSuper = u.isSuperadmin === true || u.role === "superadmin";
  if (!u.tenantId && !isSuper) return null;

  // JWT-derived baseline (fail-open default).
  const ctx: TenantContext = {
    tenantId: u.tenantId ?? "",
    userId: u.id,
    role: u.role,
    isSuperadmin: u.isSuperadmin ?? false,
  };

  // Re-validate authorization-critical claims against the DB when one is present.
  if (hasDb()) {
    try {
      // Lazy import to keep this module's static graph free of Postgres for any
      // edge-adjacent caller; only the Node runtime ever reaches this branch.
      const { authService } = await import("@/modules/auth/service");
      const fresh = await authService.resolvePrincipal(u.id);
      if (fresh) {
        if (fresh.revoked) return null; // all sessions revoked → no context = 401
        ctx.role = fresh.role;
        ctx.isSuperadmin = fresh.isSuperadmin;
      }
    } catch (err) {
      // Fail OPEN — never lock a real user out on a transient DB error; keep the
      // JWT-derived ctx. (Mirrors resolveTenantStatus's fail-open posture.)
      console.error("[session-context] principal re-resolve failed", err);
    }
  }

  return ctx;
}
