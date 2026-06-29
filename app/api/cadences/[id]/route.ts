import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService, type UpdateCadenceInput } from "@/modules/outreach/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/cadences/[id] → one cadence. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await outreachService.getCadence(g.ctx, params.id)),
    "api/cadences/[id] GET",
  );
}

// PATCH /api/cadences/[id] → update a cadence. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateCadenceInput;
    return ok(await outreachService.updateCadence(g.ctx, params.id, body));
  }, "api/cadences/[id] PATCH");
}

// DELETE /api/cadences/[id]         → SOFT delete (cascades to steps + enrollments).
// DELETE /api/cadences/[id]?purge=1 → HARD delete (permanent). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await outreachService.hardDeleteCadence(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await outreachService.softDeleteCadence(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/cadences/[id] DELETE");
}
