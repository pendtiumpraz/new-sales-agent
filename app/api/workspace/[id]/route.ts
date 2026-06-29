import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { workspaceService, type UpdateWorkspaceInput } from "@/modules/workspace/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/workspace/[id] → one workspace. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await workspaceService.get(g.ctx, params.id)),
    "api/workspace/[id] GET",
  );
}

// PATCH /api/workspace/[id] → update a workspace. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateWorkspaceInput;
    return ok(await workspaceService.update(g.ctx, params.id, body));
  }, "api/workspace/[id] PATCH");
}

// DELETE /api/workspace/[id]         → SOFT delete (sets deleted_at, cascades to satellites).
// DELETE /api/workspace/[id]?purge=1 → HARD delete (permanent removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await workspaceService.hardDelete(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await workspaceService.softDelete(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/workspace/[id] DELETE");
}
