import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { superadminService } from "@/modules/superadmin/service";

export const runtime = "nodejs";

// GET /api/superadmin/tenants → cross-tenant listing for the console. platform.manage.
// (Read-only overview; tenant lifecycle verbs live under /api/tenant/[id]/*.)
export async function GET() {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await superadminService.listTenants(g.ctx)), "api/superadmin/tenants GET");
}
