import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { salesService } from "@/modules/sales/service";

export const runtime = "nodejs";

// POST /api/sales/techniques/seed            → seed the 17 Teknik Closing (idempotent;
//                                              no-op when already seeded).
// POST /api/sales/techniques/seed?force=1    → re-seed (refresh copy on (tenant,key)).
// data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const force = new URL(req.url).searchParams.get("force");
  return handle(
    async () =>
      ok(await salesService.seedTechniques(g.ctx, { force: force === "1" || force === "true" })),
    "api/sales/techniques/seed POST",
  );
}
