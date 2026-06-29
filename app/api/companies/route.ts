import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { crmService, type CreateCompanyInput } from "@/modules/crm/service";

export const runtime = "nodejs";

// GET /api/companies → list the tenant's live companies (accounts). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await crmService.listCompanies(g.ctx)), "api/companies GET");
}

// POST /api/companies → create a company. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateCompanyInput;
    return ok(await crmService.createCompany(g.ctx, body), { status: 201 });
  }, "api/companies POST");
}
