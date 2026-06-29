import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { tenantService } from "@/modules/tenant/service";

export const runtime = "nodejs";

// GET /api/tenant/trashed → soft-deleted tenants (restore candidates). Superadmin.
export async function GET() {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await tenantService.listTrashed()), "api/tenant/trashed GET");
}
