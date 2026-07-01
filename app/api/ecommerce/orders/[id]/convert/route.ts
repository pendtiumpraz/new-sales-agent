import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { ecommerceService } from "@/modules/ecommerce/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/ecommerce/orders/[id]/convert → convert a PAID/COMPLETED order into
// CRM: upsert the buyer as a contact + create a WON deal (value = order total) in
// the default pipeline's won stage + back-link the order to the contact. Returns
// { order, contactId, dealId }. data.write.
export async function POST(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await ecommerceService.convertOrderToCrm(g.ctx, params.id)),
    "api/ecommerce/orders/[id]/convert POST",
  );
}
