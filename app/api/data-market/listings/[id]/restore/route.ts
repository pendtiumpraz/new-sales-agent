import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { dataMarketService } from "@/modules/data-market/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// PATCH /api/data-market/listings/[id]/restore → un-trash a soft-deleted listing.
// Manager-ish: tenant.settings.manage.
export async function PATCH(_req: Request, { params }: Ctx) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return g.error;
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    await dataMarketService.restoreListing(g.ctx, params.id);
    return ok({ id: params.id, restored: true });
  }, "api/data-market/listings/[id]/restore PATCH");
}
