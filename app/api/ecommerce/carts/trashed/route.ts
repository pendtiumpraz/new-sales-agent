import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { ecommerceService } from "@/modules/ecommerce/service";

export const runtime = "nodejs";

// GET /api/ecommerce/carts/trashed → soft-deleted cart recovery (restore candidates). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await ecommerceService.listTrashedCarts(g.ctx)), "api/ecommerce/carts/trashed GET");
}
