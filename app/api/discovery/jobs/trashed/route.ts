import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { enrichmentService } from "@/modules/enrichment/service";

export const runtime = "nodejs";

// GET /api/discovery/jobs/trashed → soft-deleted discovery jobs (restore candidates). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await enrichmentService.listTrashedJobs(g.ctx)),
    "api/discovery/jobs/trashed GET",
  );
}
