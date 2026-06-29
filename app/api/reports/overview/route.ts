import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { reportsService } from "@/modules/reports/service";

export const runtime = "nodejs";

// GET /api/reports/overview → the composed dashboard overview (read-only aggregate over existing tables). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok(null);
  return handle(async () => ok(await reportsService.overview(g.ctx)), "api/reports/overview GET");
}
