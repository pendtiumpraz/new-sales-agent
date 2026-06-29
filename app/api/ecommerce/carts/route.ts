import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { ecommerceService, type CreateCartInput } from "@/modules/ecommerce/service";

export const runtime = "nodejs";

// GET /api/ecommerce/carts → list the tenant's live cart recovery. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await ecommerceService.listCarts(g.ctx)), "api/ecommerce/carts GET");
}

// POST /api/ecommerce/carts → create a cart recovery. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateCartInput;
    return ok(await ecommerceService.createCart(g.ctx, body), { status: 201 });
  }, "api/ecommerce/carts POST");
}
