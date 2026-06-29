import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { marketplaceService, type UpdateListingInput } from "@/modules/marketplace/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/marketplace/listings/[id] → one listing marketplace. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await marketplaceService.getListing(g.ctx, params.id)), "api/marketplace/listings/[id] GET");
}

// PATCH /api/marketplace/listings/[id] → update a listing marketplace. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateListingInput;
    return ok(await marketplaceService.updateListing(g.ctx, params.id, body));
  }, "api/marketplace/listings/[id] PATCH");
}

// DELETE /api/marketplace/listings/[id]          → SOFT delete (sets deleted_at).
// DELETE /api/marketplace/listings/[id]?purge=1  → HARD delete (permanent removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await marketplaceService.hardDeleteListing(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await marketplaceService.softDeleteListing(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/marketplace/listings/[id] DELETE");
}
