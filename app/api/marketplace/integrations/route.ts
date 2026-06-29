import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { marketplaceService, type CreateIntegrationInput } from "@/modules/marketplace/service";

export const runtime = "nodejs";

// GET /api/marketplace/integrations → list the tenant's live integrasi marketplace. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await marketplaceService.listIntegrations(g.ctx)), "api/marketplace/integrations GET");
}

// POST /api/marketplace/integrations → create a integrasi marketplace. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateIntegrationInput;
    return ok(await marketplaceService.createIntegration(g.ctx, body), { status: 201 });
  }, "api/marketplace/integrations POST");
}
