import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { enrichmentService, type PushToContactInput } from "@/modules/enrichment/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/enrichment/[id]/push → create/update a CRM contact from the enriched
// record (sets segment + enrichment_status + fit_score), stamping the record's
// pushed_contact_id. Body (optional): { workspaceId, ownerUserId }. data.write.
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as PushToContactInput;
    return ok(await enrichmentService.pushRecordToContact(g.ctx, params.id, body), { status: 201 });
  }, "api/enrichment/[id]/push POST");
}
