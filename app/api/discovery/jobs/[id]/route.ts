import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { enrichmentService } from "@/modules/enrichment/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/discovery/jobs/[id] → one discovery job. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await enrichmentService.getJob(g.ctx, params.id)),
    "api/discovery/jobs/[id] GET",
  );
}

// DELETE /api/discovery/jobs/[id]         → SOFT delete (cascades to results).
// DELETE /api/discovery/jobs/[id]?purge=1 → HARD delete (permanent). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await enrichmentService.hardDeleteJob(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await enrichmentService.softDeleteJob(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/discovery/jobs/[id] DELETE");
}
