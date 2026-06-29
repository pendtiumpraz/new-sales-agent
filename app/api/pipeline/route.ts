import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { crmService, type CreatePipelineInput } from "@/modules/crm/service";

export const runtime = "nodejs";

// GET /api/pipeline → list the tenant's live pipelines (boards). Supports
// ?workspaceId= filter. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const workspaceId = new URL(req.url).searchParams.get("workspaceId") ?? undefined;
  return handle(
    async () => ok(await crmService.listPipelines(g.ctx, workspaceId)),
    "api/pipeline GET",
  );
}

// POST /api/pipeline → create a pipeline (board, config per tenant/workspace). data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreatePipelineInput;
    return ok(await crmService.createPipeline(g.ctx, body), { status: 201 });
  }, "api/pipeline POST");
}
