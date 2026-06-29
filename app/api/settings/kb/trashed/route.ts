import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { settingsService } from "@/modules/settings/service";

export const runtime = "nodejs";

// GET /api/settings/kb/trashed → soft-deleted KB rows (the trash view). data.read.
// Resolves before the [id] dynamic segment (static wins), so no routing conflict.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await settingsService.listTrashedKb(g.ctx)),
    "api/settings/kb/trashed GET",
  );
}
