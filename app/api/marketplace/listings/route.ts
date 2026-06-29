import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { marketplaceService, type CreateListingInput } from "@/modules/marketplace/service";

export const runtime = "nodejs";

// GET /api/marketplace/listings → list the tenant's live listing marketplace. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await marketplaceService.listListings(g.ctx)), "api/marketplace/listings GET");
}

// POST /api/marketplace/listings → create a listing marketplace. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateListingInput;
    return ok(await marketplaceService.createListing(g.ctx, body), { status: 201 });
  }, "api/marketplace/listings POST");
}
