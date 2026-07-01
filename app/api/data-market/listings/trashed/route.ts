import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, handle } from "@/modules/_shared/api";
import { dataMarketService } from "@/modules/data-market/service";

export const runtime = "nodejs";

// GET /api/data-market/listings/trashed → MY soft-deleted listings (Sampah). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return g.error;
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await dataMarketService.listMyTrashed(g.ctx)),
    "api/data-market/listings/trashed GET",
  );
}
