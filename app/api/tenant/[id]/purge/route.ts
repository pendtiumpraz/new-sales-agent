import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { tenantService } from "@/modules/tenant/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// DELETE|POST /api/tenant/[id]/purge → HARD delete (permanent row removal from
// trash). Irreversible. Superadmin-only (platform.manage). Explicit alias for
// `DELETE /api/tenant/[id]?purge=1`.
async function purge(_req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    await tenantService.hardDelete(params.id, g.ctx.userId);
    return ok({ id: params.id, purged: true });
  }, "api/tenant/[id]/purge");
}

export const DELETE = purge;
export const POST = purge;
