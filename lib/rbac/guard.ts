import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/auth/session-context";
import { can, type Permission, type Role } from "./permissions";
import type { TenantContext } from "@/lib/db/tenant-context";

type Guard = { ctx: TenantContext } | { error: NextResponse };

/**
 * Require an authenticated session that holds `permission` (doc 19). Returns the
 * tenant context, or a ready-to-return 401 (no session) / 403 (insufficient role)
 * response. Usage in a route handler:
 *   const g = await requirePermission("tenant.members.manage");
 *   if ("error" in g) return g.error;
 *   const { ctx } = g;
 */
export async function requirePermission(permission: Permission): Promise<Guard> {
  const ctx = await getTenantContext();
  if (!ctx) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!can(ctx.role as Role, permission)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ctx };
}
