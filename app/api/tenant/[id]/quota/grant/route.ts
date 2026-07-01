import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import type { TenantContext } from "@/lib/db/tenant-context";

import { ok, fail, handle } from "@/modules/_shared/api";
import { tenantService } from "@/modules/tenant/service";
import type { QuotaMetric } from "@/lib/billing/plans";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// Superadmin acts cross-tenant: scope the context to the TARGET tenant, keep the
// operator identity + superadmin role for RLS/audit.
function targetCtx(tenantId: string, operatorUserId: string): TenantContext {
  return { tenantId, userId: operatorUserId, role: "superadmin" };
}

// GET /api/tenant/[id]/quota/grant → active top-up packs for the tenant. Superadmin.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await tenantService.listQuotaGrants(targetCtx(params.id, g.ctx.userId))),
    "api/tenant/[id]/quota/grant GET",
  );
}

// POST /api/tenant/[id]/quota/grant → grant a top-up pack. Superadmin.
// Body: { metric, amount, days?=30, note? }
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      metric?: string;
      amount?: number;
      days?: number | null;
      note?: string;
    };
    if (!body.metric || !body.amount) return fail("metric + amount wajib", 400, "validation");
    const row = await tenantService.grantQuota(
      targetCtx(params.id, g.ctx.userId),
      {
        metric: body.metric as QuotaMetric,
        amount: body.amount,
        days: body.days ?? 30,
        source: "superadmin",
        note: body.note ?? null,
      },
      g.ctx.userId,
    );
    return ok(row, { status: 201 });
  }, "api/tenant/[id]/quota/grant POST");
}
