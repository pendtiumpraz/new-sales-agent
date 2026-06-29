import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import type { TenantContext } from "@/lib/db/tenant-context";

import { ok, fail, handle } from "@/modules/_shared/api";
import { tenantService } from "@/modules/tenant/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

/** Superadmin acts cross-tenant: build a context scoped to the TARGET tenant
 *  while keeping the operator's identity + role for RLS/audit. */
function targetCtx(tenantId: string, operatorUserId: string): TenantContext {
  return { tenantId, userId: operatorUserId, role: "superadmin" };
}

// GET /api/tenant/[id]/quota → list quota counters for the tenant. Superadmin.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => {
    const ctx = targetCtx(params.id, g.ctx.userId);
    return ok(await tenantService.listQuota(ctx));
  }, "api/tenant/[id]/quota GET");
}

// POST /api/tenant/[id]/quota → set/override a quota ceiling. Superadmin.
// Body: { metric: string, limit: number|null, period?: string }
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as { metric?: string; limit?: number | null; period?: string };
    if (!body.metric) return fail("Missing metric", 400, "validation");
    const ctx = targetCtx(params.id, g.ctx.userId);
    const row = await tenantService.setQuota(
      ctx,
      body.metric,
      body.limit ?? null,
      body.period ?? "lifetime",
      g.ctx.userId,
    );
    return ok(row);
  }, "api/tenant/[id]/quota POST");
}
