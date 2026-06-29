import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { ecommerceService } from "@/modules/ecommerce/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/ecommerce/carts/[id]/recover → mark recovered, optional { orderId }. data.write.
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { orderId?: string | null };
    return ok(await ecommerceService.recoverCart(g.ctx, params.id, body.orderId ?? null));
  }, "api/ecommerce/carts/[id]/recover POST");
}
