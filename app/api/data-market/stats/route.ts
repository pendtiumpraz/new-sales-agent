import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, handle } from "@/modules/_shared/api";
import { dataMarketService } from "@/modules/data-market/service";

export const runtime = "nodejs";

// GET /api/data-market/stats → the stat strip { activeListings, companiesSold,
// myPurchases }. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return g.error;
  if (!hasDb()) return ok({ activeListings: 0, companiesSold: 0, myPurchases: 0 });
  return handle(async () => ok(await dataMarketService.stats(g.ctx)), "api/data-market/stats GET");
}
