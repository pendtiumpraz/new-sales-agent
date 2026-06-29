import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { enrichmentService } from "@/modules/enrichment/service";

export const runtime = "nodejs";

// GET /api/discovery/results → list raw discovery results.
// Supports ?jobId= / ?workspaceId= / ?saved=1 filters. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const saved = sp.get("saved");
  const filter = {
    jobId: sp.get("jobId") ?? undefined,
    workspaceId: sp.get("workspaceId") ?? undefined,
    savedOnly: saved === "1" || saved === "true" ? true : undefined,
  };
  return handle(
    async () => ok(await enrichmentService.listResults(g.ctx, filter)),
    "api/discovery/results GET",
  );
}
