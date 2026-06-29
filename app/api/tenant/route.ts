import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { tenantService, type CreateTenantInput } from "@/modules/tenant/service";

export const runtime = "nodejs";

// GET /api/tenant → list active tenants (superadmin console). platform.manage.
export async function GET() {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await tenantService.list()), "api/tenant GET");
}

// POST /api/tenant → create a tenant (lands pending). platform.manage.
export async function POST(req: Request) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateTenantInput;
    const row = await tenantService.create(body, g.ctx.userId);
    return ok(row, { status: 201 });
  }, "api/tenant POST");
}
