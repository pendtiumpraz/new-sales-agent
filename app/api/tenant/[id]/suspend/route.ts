import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { tenantService } from "@/modules/tenant/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/tenant/[id]/suspend → kill-switch a tenant. Superadmin.
export async function POST(_req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await tenantService.suspend(params.id, g.ctx.userId)),
    "api/tenant/[id]/suspend POST",
  );
}
