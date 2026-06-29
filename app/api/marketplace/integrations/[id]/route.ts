import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { marketplaceService, type UpdateIntegrationInput } from "@/modules/marketplace/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/marketplace/integrations/[id] → one integrasi marketplace. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await marketplaceService.getIntegration(g.ctx, params.id)), "api/marketplace/integrations/[id] GET");
}

// PATCH /api/marketplace/integrations/[id] → update a integrasi marketplace. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateIntegrationInput;
    return ok(await marketplaceService.updateIntegration(g.ctx, params.id, body));
  }, "api/marketplace/integrations/[id] PATCH");
}

// DELETE /api/marketplace/integrations/[id]          → SOFT delete (sets deleted_at).
// DELETE /api/marketplace/integrations/[id]?purge=1  → HARD delete (permanent removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await marketplaceService.hardDeleteIntegration(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await marketplaceService.softDeleteIntegration(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/marketplace/integrations/[id] DELETE");
}
