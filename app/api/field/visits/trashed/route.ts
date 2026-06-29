import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { fieldService } from "@/modules/field/service";

export const runtime = "nodejs";

// GET /api/field/visits/trashed → soft-deleted kunjungan lapangan (restore candidates). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await fieldService.listTrashedVisits(g.ctx)), "api/field/visits/trashed GET");
}
