import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { marketplaceService } from "@/modules/marketplace/service";

export const runtime = "nodejs";

// GET /api/marketplace/listings/trashed → soft-deleted listing marketplace (restore candidates). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await marketplaceService.listTrashedListings(g.ctx)), "api/marketplace/listings/trashed GET");
}
