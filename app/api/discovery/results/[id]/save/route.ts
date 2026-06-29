import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { enrichmentService, type SaveResultInput } from "@/modules/enrichment/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/discovery/results/[id]/save → save a raw result into a workspace and
// QUEUE an enrichment record for it. Body (optional): { workspaceId }. data.write.
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as SaveResultInput;
    return ok(await enrichmentService.saveResultToWorkspace(g.ctx, params.id, body), {
      status: 201,
    });
  }, "api/discovery/results/[id]/save POST");
}
