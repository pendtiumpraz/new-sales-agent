import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { dataMarketService, type CreateListingInput } from "@/modules/data-market/service";

export const runtime = "nodejs";

// GET /api/data-market/listings → BROWSE the cross-tenant shelf: ACTIVE listings
// from OTHER tenants (firmographic company datasets). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return g.error;
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await dataMarketService.browse(g.ctx)),
    "api/data-market/listings GET",
  );
}

// POST /api/data-market/listings → CREATE a listing (snapshots the seller's own
// matching companies at publish). Manager-ish: tenant.settings.manage.
export async function POST(req: Request) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return g.error;
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateListingInput;
    return ok(await dataMarketService.createListing(g.ctx, body), { status: 201 });
  }, "api/data-market/listings POST");
}
