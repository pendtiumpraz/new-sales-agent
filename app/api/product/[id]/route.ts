import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { productService, type UpdateProductInput } from "@/modules/product/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/product/[id] → one product. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await productService.get(g.ctx, params.id)), "api/product/[id] GET");
}

// PATCH /api/product/[id] → update a product. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateProductInput;
    return ok(await productService.update(g.ctx, params.id, body));
  }, "api/product/[id] PATCH");
}

// DELETE /api/product/[id]         → SOFT delete (sets deleted_at).
// DELETE /api/product/[id]?purge=1 → HARD delete (permanent row removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await productService.hardDelete(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await productService.softDelete(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/product/[id] DELETE");
}
