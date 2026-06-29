import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { productService, type CreateProductInput } from "@/modules/product/service";

export const runtime = "nodejs";

// GET /api/product → list the tenant's live products. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await productService.list(g.ctx)), "api/product GET");
}

// POST /api/product → create a product. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateProductInput;
    const row = await productService.create(g.ctx, body);
    return ok(row, { status: 201 });
  }, "api/product POST");
}
