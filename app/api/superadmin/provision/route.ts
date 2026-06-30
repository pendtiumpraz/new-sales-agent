import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { superadminService, type ProvisionTenantInput } from "@/modules/superadmin/service";

export const runtime = "nodejs";

// POST /api/superadmin/provision → create a tenant + its FIRST admin account in
// one call, optionally with an activation window + starting quotas. platform.manage.
// Body: {
//   name, slug?, planKey?, verticalKey?,
//   admin: { name, email, password },
//   activate?: boolean, activeUntil?: ISO|null, quotas?: { [metric]: number|null }
// }
export async function POST(req: Request) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as ProvisionTenantInput;
    const result = await superadminService.provisionTenant(g.ctx, body, g.ctx.userId);
    return ok(result, { status: 201 });
  }, "api/superadmin/provision POST");
}
