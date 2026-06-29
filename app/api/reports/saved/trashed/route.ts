import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { reportsService } from "@/modules/reports/service";

export const runtime = "nodejs";

// GET /api/reports/saved/trashed → soft-deleted laporan tersimpan (restore candidates). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await reportsService.listTrashedReports(g.ctx)), "api/reports/saved/trashed GET");
}
