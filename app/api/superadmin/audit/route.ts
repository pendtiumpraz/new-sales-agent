import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { superadminService } from "@/modules/superadmin/service";

export const runtime = "nodejs";

// GET /api/superadmin/audit?tenantId=&limit= → platform audit trail. platform.manage.
export async function GET(req: Request) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId");
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Math.min(Math.max(Number.parseInt(limitRaw, 10) || 50, 1), 200) : 50;
    return ok(await superadminService.recentAudit(tenantId, limit));
  }, "api/superadmin/audit GET");
}
