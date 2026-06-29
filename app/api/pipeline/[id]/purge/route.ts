import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { crmService } from "@/modules/crm/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// DELETE|POST /api/pipeline/[id]/purge → HARD delete (permanent removal from
// trash, cascades to stages). Irreversible. data.write. Explicit alias for
// `DELETE /api/pipeline/[id]?purge=1`.
async function purge(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    await crmService.hardDeletePipeline(g.ctx, params.id);
    return ok({ id: params.id, purged: true });
  }, "api/pipeline/[id]/purge");
}

export const DELETE = purge;
export const POST = purge;
