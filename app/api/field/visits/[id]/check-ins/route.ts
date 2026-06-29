import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { fieldService } from "@/modules/field/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/field/visits/[id]/check-ins → geo-stamped check-ins of a visit. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await fieldService.listCheckIns(g.ctx, params.id)),
    "api/field/visits/[id]/check-ins GET",
  );
}
