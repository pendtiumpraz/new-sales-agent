import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { salesService, type UpdateTechniqueInput } from "@/modules/sales/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/sales/techniques/[id] → one technique. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await salesService.getTechnique(g.ctx, params.id)),
    "api/sales/techniques/[id] GET",
  );
}

// PATCH /api/sales/techniques/[id] → update a technique. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateTechniqueInput;
    return ok(await salesService.updateTechnique(g.ctx, params.id, body));
  }, "api/sales/techniques/[id] PATCH");
}

// DELETE /api/sales/techniques/[id]         → SOFT delete (sets deleted_at).
// DELETE /api/sales/techniques/[id]?purge=1 → HARD delete (permanent). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await salesService.hardDeleteTechnique(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await salesService.softDeleteTechnique(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/sales/techniques/[id] DELETE");
}
