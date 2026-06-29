import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { ecommerceService, type CreateOrderInput } from "@/modules/ecommerce/service";

export const runtime = "nodejs";

// GET /api/ecommerce/orders → list the tenant's live order marketplace. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await ecommerceService.listOrders(g.ctx)), "api/ecommerce/orders GET");
}

// POST /api/ecommerce/orders → create a order marketplace. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateOrderInput;
    return ok(await ecommerceService.createOrder(g.ctx, body), { status: 201 });
  }, "api/ecommerce/orders POST");
}
