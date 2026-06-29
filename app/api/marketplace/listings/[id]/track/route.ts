import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { marketplaceService } from "@/modules/marketplace/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/marketplace/listings/[id]/track → bump engagement { views?, leads? }. data.write.
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { views?: number; leads?: number };
    return ok(await marketplaceService.trackListing(g.ctx, params.id, body));
  }, "api/marketplace/listings/[id]/track POST");
}
