import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { productService } from "@/modules/product/service";

export const runtime = "nodejs";

// GET /api/product/trashed → soft-deleted products (restore candidates). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await productService.listTrashed(g.ctx)), "api/product/trashed GET");
}
