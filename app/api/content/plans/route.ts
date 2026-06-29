import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { contentService, type CreatePlanInput } from "@/modules/content/service";

export const runtime = "nodejs";

// GET /api/content/plans → list the tenant's live rencana konten. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await contentService.listPlans(g.ctx)), "api/content/plans GET");
}

// POST /api/content/plans → create a rencana konten. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreatePlanInput;
    return ok(await contentService.createPlan(g.ctx, body), { status: 201 });
  }, "api/content/plans POST");
}
