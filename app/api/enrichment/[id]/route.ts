import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { enrichmentService } from "@/modules/enrichment/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/enrichment/[id] → one enrichment record. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await enrichmentService.getRecord(g.ctx, params.id)),
    "api/enrichment/[id] GET",
  );
}

// DELETE /api/enrichment/[id]         → SOFT delete.
// DELETE /api/enrichment/[id]?purge=1 → HARD delete (permanent). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await enrichmentService.hardDeleteRecord(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await enrichmentService.softDeleteRecord(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/enrichment/[id] DELETE");
}
