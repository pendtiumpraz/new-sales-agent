import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { reportsService, type UpdateReportInput } from "@/modules/reports/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/reports/saved/[id] → one laporan tersimpan. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await reportsService.getReport(g.ctx, params.id)), "api/reports/saved/[id] GET");
}

// PATCH /api/reports/saved/[id] → update a laporan tersimpan. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateReportInput;
    return ok(await reportsService.updateReport(g.ctx, params.id, body));
  }, "api/reports/saved/[id] PATCH");
}

// DELETE /api/reports/saved/[id]          → SOFT delete (sets deleted_at).
// DELETE /api/reports/saved/[id]?purge=1  → HARD delete (permanent removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await reportsService.hardDeleteReport(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await reportsService.softDeleteReport(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/reports/saved/[id] DELETE");
}
