import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService, type UpdateEscalationInput } from "@/modules/outreach/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/escalations/[id] → one escalation. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await outreachService.getEscalation(g.ctx, params.id)),
    "api/escalations/[id] GET",
  );
}

// PATCH /api/escalations/[id] → update status (open|acknowledged|resolved|
// dismissed), priority, assignee, resolution note. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateEscalationInput;
    return ok(await outreachService.updateEscalation(g.ctx, params.id, body));
  }, "api/escalations/[id] PATCH");
}

// DELETE /api/escalations/[id]         → SOFT delete.
// DELETE /api/escalations/[id]?purge=1 → HARD delete. data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await outreachService.hardDeleteEscalation(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await outreachService.softDeleteEscalation(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/escalations/[id] DELETE");
}
