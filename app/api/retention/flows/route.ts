import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { retentionService, type CreateFlowInput } from "@/modules/retention/service";

export const runtime = "nodejs";

// GET /api/retention/flows → list the tenant's live flow retensi. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await retentionService.listFlows(g.ctx)), "api/retention/flows GET");
}

// POST /api/retention/flows → create a flow retensi. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateFlowInput;
    return ok(await retentionService.createFlow(g.ctx, body), { status: 201 });
  }, "api/retention/flows POST");
}
