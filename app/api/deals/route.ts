import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle, parseLimit, type Page } from "@/modules/_shared/api";
import { crmService, type CreateDealInput } from "@/modules/crm/service";
import type { DealRow } from "@/modules/crm/schema";

export const runtime = "nodejs";

// GET /api/deals → one keyset page of the tenant's live deals (newest first) + a
// `nextCursor`. Supports ?pipelineId= / ?stageId= / ?contactId= / ?workspaceId=
// filters and ?limit= / ?cursor= pagination. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  const empty: Page<DealRow> = { items: [], nextCursor: null };
  if (!hasDb()) return ok(empty);
  const sp = new URL(req.url).searchParams;
  const filter = {
    pipelineId: sp.get("pipelineId") ?? undefined,
    stageId: sp.get("stageId") ?? undefined,
    contactId: sp.get("contactId") ?? undefined,
    workspaceId: sp.get("workspaceId") ?? undefined,
  };
  const page = { limit: parseLimit(sp.get("limit")), cursor: sp.get("cursor") ?? undefined };
  return handle(async () => ok(await crmService.pageDeals(g.ctx, filter, page)), "api/deals GET");
}

// POST /api/deals → create a deal (belongs to a contact + a pipeline stage +
// value). data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateDealInput;
    return ok(await crmService.createDeal(g.ctx, body), { status: 201 });
  }, "api/deals POST");
}
