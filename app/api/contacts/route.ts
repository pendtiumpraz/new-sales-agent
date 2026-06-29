import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { crmService, type CreateContactInput } from "@/modules/crm/service";

export const runtime = "nodejs";

// GET /api/contacts → list the tenant's live contacts (the person/lead). Supports
// ?workspaceId= / ?companyId= / ?segment= filters. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const filter = {
    workspaceId: sp.get("workspaceId") ?? undefined,
    companyId: sp.get("companyId") ?? undefined,
    segment: sp.get("segment") ?? undefined,
  };
  return handle(async () => ok(await crmService.listContacts(g.ctx, filter)), "api/contacts GET");
}

// POST /api/contacts → create a contact (segment b2c|b2b|unknown + enrichment +
// fit_score + workspace_id). data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateContactInput;
    return ok(await crmService.createContact(g.ctx, body), { status: 201 });
  }, "api/contacts POST");
}
