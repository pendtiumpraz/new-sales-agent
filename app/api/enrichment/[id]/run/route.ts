import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { enrichmentService, type RunEnrichmentInput } from "@/modules/enrichment/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/enrichment/[id]/run → run enrichment on a queued record (merge filled
// fields, flip status → enriched). Body (optional): { fields, source }. data.write.
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as RunEnrichmentInput;
    return ok(await enrichmentService.runEnrichment(g.ctx, params.id, body));
  }, "api/enrichment/[id]/run POST");
}
