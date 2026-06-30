import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { taxonomyService, type UpdateTaxonomyInput } from "@/modules/taxonomy/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/taxonomy/industries/[id] → one industry. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await taxonomyService.getIndustry(g.ctx, params.id)),
    "api/taxonomy/industries/[id] GET",
  );
}

// PATCH /api/taxonomy/industries/[id] → rename / update. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateTaxonomyInput;
    return ok(await taxonomyService.updateIndustry(g.ctx, params.id, body));
  }, "api/taxonomy/industries/[id] PATCH");
}

// DELETE /api/taxonomy/industries/[id]         → SOFT delete.
// DELETE /api/taxonomy/industries/[id]?purge=1 → HARD delete (permanent). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await taxonomyService.hardDeleteIndustry(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await taxonomyService.softDeleteIndustry(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/taxonomy/industries/[id] DELETE");
}
