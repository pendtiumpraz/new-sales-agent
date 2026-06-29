import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { enrichmentService, type RunDiscoveryInput } from "@/modules/enrichment/service";

export const runtime = "nodejs";

// GET /api/discovery/jobs → list the tenant's discovery runs.
// Supports ?workspaceId= / ?channel= / ?status= filters. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const filter = {
    workspaceId: sp.get("workspaceId") ?? undefined,
    channel: sp.get("channel") ?? undefined,
    status: sp.get("status") ?? undefined,
  };
  return handle(
    async () => ok(await enrichmentService.listJobs(g.ctx, filter)),
    "api/discovery/jobs GET",
  );
}

// POST /api/discovery/jobs → run a discovery search (persists the run + its raw
// results). Body: RunDiscoveryInput. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as RunDiscoveryInput;
    return ok(await enrichmentService.runDiscovery(g.ctx, body), { status: 201 });
  }, "api/discovery/jobs POST");
}
