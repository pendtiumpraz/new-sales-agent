import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { workspaceService, type SalesPlayInput } from "@/modules/workspace/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/workspace/[id]/sales-play → the workspace's sales-play config (or null).
// data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok(null);
  return handle(
    async () => ok(await workspaceService.getSalesPlay(g.ctx, params.id)),
    "api/workspace/[id]/sales-play GET",
  );
}

// PUT /api/workspace/[id]/sales-play → upsert the sales-play config (techniques,
// channel, tone, steps). data.write.
export async function PUT(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as SalesPlayInput;
    return ok(await workspaceService.saveSalesPlay(g.ctx, params.id, body));
  }, "api/workspace/[id]/sales-play PUT");
}
