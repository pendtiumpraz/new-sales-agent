import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { superadminService } from "@/modules/superadmin/service";

export const runtime = "nodejs";

// GET /api/superadmin/overview → cross-tenant rollup (counts). platform.manage.
export async function GET() {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb())
    return ok({
      tenants: { total: 0, byStatus: {} },
      users: { total: 0, superadmins: 0 },
      auditEvents: 0,
    });
  return handle(async () => ok(await superadminService.overview(g.ctx)), "api/superadmin/overview GET");
}
