import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { crmService, type CreateDealInput } from "@/modules/crm/service";

export const runtime = "nodejs";

// GET /api/deals → list the tenant's live deals. Supports ?pipelineId= / ?stageId=
// / ?contactId= / ?workspaceId= filters. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const filter = {
    pipelineId: sp.get("pipelineId") ?? undefined,
    stageId: sp.get("stageId") ?? undefined,
    contactId: sp.get("contactId") ?? undefined,
    workspaceId: sp.get("workspaceId") ?? undefined,
  };
  return handle(async () => ok(await crmService.listDeals(g.ctx, filter)), "api/deals GET");
}

// POST /api/deals → create a deal (belongs to a contact + a pipeline stage +
// value). data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateDealInput;
    return ok(await crmService.createDeal(g.ctx, body), { status: 201 });
  }, "api/deals POST");
}
