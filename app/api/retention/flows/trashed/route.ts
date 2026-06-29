import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { retentionService } from "@/modules/retention/service";

export const runtime = "nodejs";

// GET /api/retention/flows/trashed → soft-deleted flow retensi (restore candidates). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await retentionService.listTrashedFlows(g.ctx)), "api/retention/flows/trashed GET");
}
