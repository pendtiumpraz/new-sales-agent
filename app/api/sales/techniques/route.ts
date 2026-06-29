import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { salesService, type CreateTechniqueInput } from "@/modules/sales/service";

export const runtime = "nodejs";

// GET /api/sales/techniques            → list the tenant's live closing techniques.
// GET /api/sales/techniques?trashed=1  → soft-deleted techniques. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const trashed = new URL(req.url).searchParams.get("trashed");
  return handle<unknown>(async () => {
    if (trashed === "1" || trashed === "true")
      return ok(await salesService.listTrashedTechniques(g.ctx));
    return ok(await salesService.listTechniques(g.ctx));
  }, "api/sales/techniques GET");
}

// POST /api/sales/techniques → create a custom closing technique. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateTechniqueInput;
    const row = await salesService.createTechnique(g.ctx, body);
    return ok(row, { status: 201 });
  }, "api/sales/techniques POST");
}
