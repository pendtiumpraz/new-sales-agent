import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { ecommerceService, type UpdateCartInput } from "@/modules/ecommerce/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/ecommerce/carts/[id] → one cart recovery. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await ecommerceService.getCart(g.ctx, params.id)), "api/ecommerce/carts/[id] GET");
}

// PATCH /api/ecommerce/carts/[id] → update a cart recovery. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateCartInput;
    return ok(await ecommerceService.updateCart(g.ctx, params.id, body));
  }, "api/ecommerce/carts/[id] PATCH");
}

// DELETE /api/ecommerce/carts/[id]          → SOFT delete (sets deleted_at).
// DELETE /api/ecommerce/carts/[id]?purge=1  → HARD delete (permanent removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await ecommerceService.hardDeleteCart(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await ecommerceService.softDeleteCart(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/ecommerce/carts/[id] DELETE");
}
