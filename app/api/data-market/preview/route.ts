import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, handle } from "@/modules/_shared/api";
import { dataMarketService, type ListingFilterInput } from "@/modules/data-market/service";

export const runtime = "nodejs";

// POST /api/data-market/preview → preview { companyCount, sample } for an
// industry/segment filter over the seller's OWN companies (drives the create
// drawer's live count before publish). Read-only. data.read.
export async function POST(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return g.error;
  if (!hasDb()) return ok({ companyCount: 0, sample: [] });
  return handle(async () => {
    const body = (await req.json()) as ListingFilterInput;
    return ok(await dataMarketService.preview(g.ctx, body));
  }, "api/data-market/preview POST");
}
