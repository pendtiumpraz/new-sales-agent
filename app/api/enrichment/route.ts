import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { enrichmentService, type QueueEnrichmentInput } from "@/modules/enrichment/service";

export const runtime = "nodejs";

// GET /api/enrichment → list the tenant's enrichment records.
// Supports ?contactId= / ?workspaceId= / ?status= filters. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const filter = {
    contactId: sp.get("contactId") ?? undefined,
    workspaceId: sp.get("workspaceId") ?? undefined,
    status: sp.get("status") ?? undefined,
  };
  return handle(
    async () => ok(await enrichmentService.listRecords(g.ctx, filter)),
    "api/enrichment GET",
  );
}

// POST /api/enrichment → QUEUE an enrichment record for a contact OR a saved
// discovery result. Body: QueueEnrichmentInput ({ contactId } | { resultId }). data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as QueueEnrichmentInput;
    return ok(await enrichmentService.queueEnrichment(g.ctx, body), { status: 201 });
  }, "api/enrichment POST");
}
