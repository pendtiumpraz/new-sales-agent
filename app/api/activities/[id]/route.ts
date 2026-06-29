import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { crmService, type UpdateActivityInput } from "@/modules/crm/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/activities/[id] → one activity. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await crmService.getActivity(g.ctx, params.id)),
    "api/activities/[id] GET",
  );
}

// PATCH /api/activities/[id] → update an activity. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateActivityInput;
    return ok(await crmService.updateActivity(g.ctx, params.id, body));
  }, "api/activities/[id] PATCH");
}

// DELETE /api/activities/[id]         → SOFT delete.
// DELETE /api/activities/[id]?purge=1 → HARD delete (permanent removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await crmService.hardDeleteActivity(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await crmService.softDeleteActivity(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/activities/[id] DELETE");
}
