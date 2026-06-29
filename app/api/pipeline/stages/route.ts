import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { crmService, type CreateStageInput } from "@/modules/crm/service";

export const runtime = "nodejs";

// GET /api/pipeline/stages → list stages (ordered columns). Supports ?pipelineId=
// to fetch one board's stages. data.read. (Static `stages` segment resolves
// before the dynamic `/api/pipeline/[id]` segment, so there's no route conflict.)
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const pipelineId = new URL(req.url).searchParams.get("pipelineId") ?? undefined;
  return handle(
    async () => ok(await crmService.listStages(g.ctx, pipelineId)),
    "api/pipeline/stages GET",
  );
}

// POST /api/pipeline/stages → create a stage on a pipeline. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateStageInput;
    return ok(await crmService.createStage(g.ctx, body), { status: 201 });
  }, "api/pipeline/stages POST");
}
