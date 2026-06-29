import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { tenantService, type ActivateTenantInput } from "@/modules/tenant/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/tenant/[id]/activate → activate w/ optional duration + plan. Superadmin.
// Body: { until?: ISO-date|null, planKey?: string }
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as ActivateTenantInput;
    return ok(await tenantService.activate(params.id, body, g.ctx.userId));
  }, "api/tenant/[id]/activate POST");
}
