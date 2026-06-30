import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { taxonomyService } from "@/modules/taxonomy/service";

export const runtime = "nodejs";

interface MergeBody {
  fromId?: string;
  toId?: string;
}

// POST /api/taxonomy/industries/merge → merge fromId INTO toId (re-point refs,
// soft-delete the merged-away row). Body: { fromId, toId }. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as MergeBody;
    const fromId = body.fromId?.trim();
    const toId = body.toId?.trim();
    if (!fromId || !toId) return fail("fromId dan toId wajib diisi", 400, "validation");
    return ok(await taxonomyService.mergeIndustry(g.ctx, fromId, toId));
  }, "api/taxonomy/industries/merge POST");
}
