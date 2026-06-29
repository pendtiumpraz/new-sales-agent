import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService } from "@/modules/outreach/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// DELETE|POST /api/escalations/[id]/purge → HARD delete an escalation.
// Irreversible. data.write.
async function purge(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    await outreachService.hardDeleteEscalation(g.ctx, params.id);
    return ok({ id: params.id, purged: true });
  }, "api/escalations/[id]/purge");
}

export const DELETE = purge;
export const POST = purge;
