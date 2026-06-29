import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService } from "@/modules/outreach/service";

export const runtime = "nodejs";

// GET /api/autopilot/trashed → soft-deleted autopilot runs. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await outreachService.listTrashedRuns(g.ctx)),
    "api/autopilot/trashed GET",
  );
}
