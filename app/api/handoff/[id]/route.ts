import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService, type UpdateHandoffInput } from "@/modules/outreach/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/handoff/[id] → one handoff. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await outreachService.getHandoff(g.ctx, params.id)),
    "api/handoff/[id] GET",
  );
}

// PATCH /api/handoff/[id] → update status (pending|claimed|done|cancelled),
// priority, assignee, note, due. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateHandoffInput;
    return ok(await outreachService.updateHandoff(g.ctx, params.id, body));
  }, "api/handoff/[id] PATCH");
}

// DELETE /api/handoff/[id]         → SOFT delete.
// DELETE /api/handoff/[id]?purge=1 → HARD delete. data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await outreachService.hardDeleteHandoff(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await outreachService.softDeleteHandoff(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/handoff/[id] DELETE");
}
