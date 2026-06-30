import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { taxonomyService, type CreateTaxonomyInput } from "@/modules/taxonomy/service";

export const runtime = "nodejs";

// GET /api/taxonomy/industries → list (global base ∪ tenant rows). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await taxonomyService.listIndustries(g.ctx)),
    "api/taxonomy/industries GET",
  );
}

// POST /api/taxonomy/industries → create a tenant industry. Body: CreateTaxonomyInput.
// data.write (master-data is tenant config, gated like other writes).
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateTaxonomyInput;
    return ok(await taxonomyService.createIndustry(g.ctx, body), { status: 201 });
  }, "api/taxonomy/industries POST");
}
