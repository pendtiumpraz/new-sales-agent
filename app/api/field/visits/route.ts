import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { fieldService, type CreateVisitInput } from "@/modules/field/service";

export const runtime = "nodejs";

// GET /api/field/visits → list the tenant's live kunjungan lapangan. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await fieldService.listVisits(g.ctx)), "api/field/visits GET");
}

// POST /api/field/visits → create a kunjungan lapangan. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateVisitInput;
    return ok(await fieldService.createVisit(g.ctx, body), { status: 201 });
  }, "api/field/visits POST");
}
