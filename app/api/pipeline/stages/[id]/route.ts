import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { crmService, type UpdateStageInput } from "@/modules/crm/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/pipeline/stages/[id] → one stage. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await crmService.getStage(g.ctx, params.id)),
    "api/pipeline/stages/[id] GET",
  );
}

// PATCH /api/pipeline/stages/[id] → update a stage (rename, reorder, win/lost). data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateStageInput;
    return ok(await crmService.updateStage(g.ctx, params.id, body));
  }, "api/pipeline/stages/[id] PATCH");
}

// DELETE /api/pipeline/stages/[id]         → SOFT delete.
// DELETE /api/pipeline/stages/[id]?purge=1 → HARD delete (permanent removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await crmService.hardDeleteStage(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await crmService.softDeleteStage(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/pipeline/stages/[id] DELETE");
}
