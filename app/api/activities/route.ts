import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { crmService, type CreateActivityInput } from "@/modules/crm/service";

export const runtime = "nodejs";

// GET /api/activities → list the tenant's live activities. Supports
// ?subjectType= (contact|company|deal) + ?subjectId= to fetch one subject's
// timeline. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const filter = {
    subjectType: sp.get("subjectType") ?? undefined,
    subjectId: sp.get("subjectId") ?? undefined,
  };
  return handle(async () => ok(await crmService.listActivities(g.ctx, filter)), "api/activities GET");
}

// POST /api/activities → create a timeline activity on a contact/company/deal. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateActivityInput;
    return ok(await crmService.createActivity(g.ctx, body), { status: 201 });
  }, "api/activities POST");
}
