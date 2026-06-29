import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { crmService, type UpdatePipelineInput } from "@/modules/crm/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/pipeline/[id] → one pipeline. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await crmService.getPipeline(g.ctx, params.id)),
    "api/pipeline/[id] GET",
  );
}

// PATCH /api/pipeline/[id] → update a pipeline. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdatePipelineInput;
    return ok(await crmService.updatePipeline(g.ctx, params.id, body));
  }, "api/pipeline/[id] PATCH");
}

// DELETE /api/pipeline/[id]         → SOFT delete (cascades to its stages).
// DELETE /api/pipeline/[id]?purge=1 → HARD delete (permanent removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await crmService.hardDeletePipeline(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await crmService.softDeletePipeline(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/pipeline/[id] DELETE");
}
