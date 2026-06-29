import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { enrichmentService, type ClassifyInput } from "@/modules/enrichment/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/enrichment/[id]/classify → decide B2C/B2B + fit_score (heuristic, or a
// manual override). Mirrors the result onto the CRM contact. Body (optional):
// { classification, fitScore, fitReason }. data.write.
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as ClassifyInput;
    return ok(await enrichmentService.classifyRecord(g.ctx, params.id, body));
  }, "api/enrichment/[id]/classify POST");
}
