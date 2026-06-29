import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { superadminService, type CreateOperatorInput } from "@/modules/superadmin/service";

export const runtime = "nodejs";

// GET /api/superadmin/users → platform user directory. platform.manage.
export async function GET() {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await superadminService.listUsers()), "api/superadmin/users GET");
}

// POST /api/superadmin/users → create a platform-staff (superadmin) account.
// Body: { name, email, password }. platform.manage.
export async function POST(req: Request) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateOperatorInput;
    const row = await superadminService.createOperator(body, g.ctx.userId);
    return ok(row, { status: 201 });
  }, "api/superadmin/users POST");
}
