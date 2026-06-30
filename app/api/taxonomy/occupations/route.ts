import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { taxonomyService, type CreateTaxonomyInput } from "@/modules/taxonomy/service";

export const runtime = "nodejs";

// GET /api/taxonomy/occupations → list (global base ∪ tenant rows). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await taxonomyService.listOccupations(g.ctx)),
    "api/taxonomy/occupations GET",
  );
}

// POST /api/taxonomy/occupations → create a tenant occupation. Body: CreateTaxonomyInput.
// data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateTaxonomyInput;
    return ok(await taxonomyService.createOccupation(g.ctx, body), { status: 201 });
  }, "api/taxonomy/occupations POST");
}
