import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { contentService } from "@/modules/content/service";

export const runtime = "nodejs";

// GET /api/content/plans/trashed → soft-deleted rencana konten (restore candidates). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await contentService.listTrashedPlans(g.ctx)), "api/content/plans/trashed GET");
}
