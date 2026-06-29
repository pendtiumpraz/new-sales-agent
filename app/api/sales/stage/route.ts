import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { salesService, type EvaluateStageInput } from "@/modules/sales/service";

export const runtime = "nodejs";

// GET /api/sales/stage                       → list the tenant's live stage rows.
// GET /api/sales/stage?conversationId=cnv_…  → one conversation's stage (or null).
// GET /api/sales/stage?trashed=1             → soft-deleted stage rows. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  const trashed = url.searchParams.get("trashed");
  return handle<unknown>(async () => {
    if (conversationId) return ok(await salesService.getStage(g.ctx, conversationId));
    if (trashed === "1" || trashed === "true") return ok(await salesService.listTrashedStages(g.ctx));
    return ok(await salesService.listStages(g.ctx));
  }, "api/sales/stage GET");
}

// POST /api/sales/stage → evaluate (run the stage-machine) + persist. The stage
// machine is heuristic; pass {useAi:true} to opt into AI refinement (falls back).
// data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as EvaluateStageInput;
    const row = await salesService.evaluateStage(g.ctx, body);
    return ok(row, { status: 201 });
  }, "api/sales/stage POST");
}
