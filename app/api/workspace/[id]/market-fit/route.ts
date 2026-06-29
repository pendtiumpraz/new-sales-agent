import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { workspaceService, type MarketFitInput } from "@/modules/workspace/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/workspace/[id]/market-fit → the workspace's market-fit result (or null).
// data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok(null);
  return handle(
    async () => ok(await workspaceService.getMarketFit(g.ctx, params.id)),
    "api/workspace/[id]/market-fit GET",
  );
}

// PUT /api/workspace/[id]/market-fit → upsert the market-fit result (B2B/B2C/mix
// + ICP). data.write.
export async function PUT(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as MarketFitInput;
    return ok(await workspaceService.saveMarketFit(g.ctx, params.id, body));
  }, "api/workspace/[id]/market-fit PUT");
}
