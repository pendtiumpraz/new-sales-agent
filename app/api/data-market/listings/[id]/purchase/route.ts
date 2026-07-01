import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { dataMarketService } from "@/modules/data-market/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/data-market/listings/[id]/purchase → BUY a listing: copy its
// firmographic company snapshot into the buyer's CRM (dedup) + record the ledger.
// Manager-ish (a spend/import action): tenant.settings.manage.
export async function POST(_req: Request, { params }: Ctx) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return g.error;
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await dataMarketService.purchase(g.ctx, params.id), { status: 201 }),
    "api/data-market/listings/[id]/purchase POST",
  );
}
