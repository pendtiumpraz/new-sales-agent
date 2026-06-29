import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { reportsService, type CreateReportInput } from "@/modules/reports/service";

export const runtime = "nodejs";

// GET /api/reports/saved → list the tenant's live laporan tersimpan. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await reportsService.listReports(g.ctx)), "api/reports/saved GET");
}

// POST /api/reports/saved → create a laporan tersimpan. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateReportInput;
    return ok(await reportsService.createReport(g.ctx, body), { status: 201 });
  }, "api/reports/saved POST");
}
