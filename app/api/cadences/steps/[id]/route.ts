import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService, type UpdateStepInput } from "@/modules/outreach/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/cadences/steps/[id] → one step. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await outreachService.getStep(g.ctx, params.id)),
    "api/cadences/steps/[id] GET",
  );
}

// PATCH /api/cadences/steps/[id] → update a step. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateStepInput;
    return ok(await outreachService.updateStep(g.ctx, params.id, body));
  }, "api/cadences/steps/[id] PATCH");
}

// DELETE /api/cadences/steps/[id]         → SOFT delete.
// DELETE /api/cadences/steps/[id]?purge=1 → HARD delete. data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await outreachService.hardDeleteStep(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await outreachService.softDeleteStep(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/cadences/steps/[id] DELETE");
}
