import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { retentionService } from "@/modules/retention/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// DELETE|POST /api/retention/steps/[id]/purge → HARD delete (permanent removal from trash).
// Irreversible. data.write. Explicit alias for DELETE /api/retention/steps/[id]?purge=1.
async function purge(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    await retentionService.hardDeleteStep(g.ctx, params.id);
    return ok({ id: params.id, purged: true });
  }, "api/retention/steps/[id]/purge");
}

export const DELETE = purge;
export const POST = purge;
