import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { taxonomyService } from "@/modules/taxonomy/service";

export const runtime = "nodejs";

// GET /api/taxonomy/occupations/trashed → the tenant's soft-deleted occupations
// (restore / purge candidates). The global base is never trashed here. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await taxonomyService.listTrashedOccupations(g.ctx)),
    "api/taxonomy/occupations/trashed GET",
  );
}
