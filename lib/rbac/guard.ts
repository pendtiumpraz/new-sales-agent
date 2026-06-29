import type { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/auth/session-context";
import { hasDb } from "@/lib/db/client";
import { tenantRepo } from "@/modules/tenant/repo";
import { fail, type ApiErr } from "@/modules/_shared/api";
import { can, type Permission, type Role } from "./permissions";
import type { TenantContext } from "@/lib/db/tenant-context";

type Guard = { ctx: TenantContext } | { error: NextResponse<ApiErr> };

export interface GuardOptions {
  /**
   * Allow a non-active (pending / suspended / expired) tenant through. ONLY the
   * recovery surface should set this — the status/onboarding/billing endpoints a
   * blocked tenant needs to see why it's blocked and to pay/reactivate. Defaults
   * to false: everything else is 403'd for a non-active tenant (audit #6).
   */
  allowInactiveTenant?: boolean;
}

/**
 * Require an authenticated session that holds `permission` (doc 19). Returns the
 * tenant context, or a ready-to-return error response that ALREADY carries the
 * `{ ok:false, error }` envelope (audit #11) with the correct status:
 *   - 401 when there is no session,
 *   - 403 when the session lacks the permission, the tenant is non-active, or
 *     the role can't be resolved.
 *
 * Usage in a route handler:
 *   const g = await requirePermission("tenant.members.manage");
 *   if ("error" in g) return g.error;   // envelope + status already correct
 *   const { ctx } = g;
 *
 * Tenant-status enforcement (audit #6): a pending/suspended/expired tenant is
 * 403'd here, server-side, instead of relying on the client-only shell gate. The
 * status is resolved LIVE from the `tenant` table (not the possibly-stale JWT
 * claim). Superadmins (`platform.manage`) are exempt so the kill-switch console
 * keeps working; recovery endpoints opt out via `allowInactiveTenant`.
 */
export async function requirePermission(
  permission: Permission,
  options: GuardOptions = {},
): Promise<Guard> {
  const ctx = await getTenantContext();
  // 401 — no session at all.
  if (!ctx) {
    return { error: fail("Unauthorized", 401, "unauthorized") };
  }
  // 403 — authenticated but lacks the permission.
  if (!can(ctx.role as Role, permission)) {
    return { error: fail("Forbidden", 403, "forbidden") };
  }

  // 403 — tenant suspended/pending/expired (kill-switch enforced server-side).
  // Superadmin platform actions are exempt (they operate ON blocked tenants);
  // so are explicitly-opted-out recovery endpoints. Skipped without a DB
  // (mock/demo) — there's no tenant row to consult.
  const exempt =
    options.allowInactiveTenant ||
    permission === "platform.manage" ||
    ctx.role === "superadmin";
  if (!exempt && hasDb()) {
    const status = await resolveTenantStatus(ctx);
    if (status && !isActiveStatus(status.status, status.activeUntil)) {
      return {
        error: fail(
          "Tenant tidak aktif — hubungi admin atau selesaikan aktivasi",
          403,
          "tenant_inactive",
        ),
      };
    }
  }

  return { ctx };
}

interface ResolvedStatus {
  status: string;
  activeUntil: Date | null;
}

/** Live tenant status from the rebuild `tenant` table. Fails OPEN (returns null
 *  → treated as active) on a lookup error so a transient DB glitch never locks a
 *  real tenant out — mirrors the app-shell gate's fail-open posture. */
async function resolveTenantStatus(ctx: TenantContext): Promise<ResolvedStatus | null> {
  try {
    const row = await tenantRepo.getTenant(ctx.tenantId);
    if (!row) return null; // unknown tenant (e.g. demo t_default) → don't block
    return { status: row.status, activeUntil: row.activeUntil ?? null };
  } catch (err) {
    console.error("[guard] tenant status lookup failed", err);
    return null;
  }
}

/** A tenant is usable only when status='active' AND not past its activeUntil. */
function isActiveStatus(status: string, activeUntil: Date | null): boolean {
  if (status !== "active") return false;
  if (activeUntil && activeUntil.getTime() < Date.now()) return false;
  return true;
}
