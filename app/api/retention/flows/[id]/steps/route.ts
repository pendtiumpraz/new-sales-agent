import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { retentionService } from "@/modules/retention/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/retention/flows/[id]/steps → ordered steps of a retention flow. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await retentionService.listSteps(g.ctx, params.id)),
    "api/retention/flows/[id]/steps GET",
  );
}
