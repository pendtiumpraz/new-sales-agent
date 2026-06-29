import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { workspaceService } from "@/modules/workspace/service";

export const runtime = "nodejs";

// GET /api/workspace/trashed → soft-deleted workspaces (restore candidates). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await workspaceService.listTrashed(g.ctx)),
    "api/workspace/trashed GET",
  );
}
