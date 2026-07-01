import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { dataMarketService } from "@/modules/data-market/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// PATCH /api/data-market/listings/[id] → pause/resume ({ status:'active'|'paused' }).
// Manager-ish: tenant.settings.manage (only the seller can manage its listing).
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return g.error;
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as { status?: string };
    return ok(await dataMarketService.setStatus(g.ctx, params.id, body.status ?? "paused"));
  }, "api/data-market/listings/[id] PATCH");
}

// DELETE /api/data-market/listings/[id]          → SOFT delete (to Sampah).
// DELETE /api/data-market/listings/[id]?purge=1  → HARD delete (permanent).
// Manager-ish: tenant.settings.manage.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return g.error;
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await dataMarketService.hardDeleteListing(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await dataMarketService.softDeleteListing(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/data-market/listings/[id] DELETE");
}
