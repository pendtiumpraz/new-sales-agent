import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { retentionService, type CreateStepInput } from "@/modules/retention/service";

export const runtime = "nodejs";

// GET /api/retention/steps?flowId=… → ordered steps of a retention flow. data.read.
// A step belongs to a flow, so `flowId` is required (or use the nested
// /api/retention/flows/[id]/steps route).
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const flowId = new URL(req.url).searchParams.get("flowId");
  if (!flowId) return fail("Parameter flowId wajib diisi", 400, "validation");
  return handle(
    async () => ok(await retentionService.listSteps(g.ctx, flowId)),
    "api/retention/steps GET",
  );
}

// POST /api/retention/steps → create a step retensi. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateStepInput;
    return ok(await retentionService.createStep(g.ctx, body), { status: 201 });
  }, "api/retention/steps POST");
}
