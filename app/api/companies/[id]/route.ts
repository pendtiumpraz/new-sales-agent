import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { crmService, type UpdateCompanyInput } from "@/modules/crm/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/companies/[id] → one company. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await crmService.getCompany(g.ctx, params.id)), "api/companies/[id] GET");
}

// PATCH /api/companies/[id] → update a company. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateCompanyInput;
    return ok(await crmService.updateCompany(g.ctx, params.id, body));
  }, "api/companies/[id] PATCH");
}

// DELETE /api/companies/[id]         → SOFT delete (cascades to contacts + activities).
// DELETE /api/companies/[id]?purge=1 → HARD delete (permanent removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await crmService.hardDeleteCompany(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await crmService.softDeleteCompany(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/companies/[id] DELETE");
}
