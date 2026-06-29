import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { tenantService } from "@/modules/tenant/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/tenant/[id] → one tenant. platform.manage.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await tenantService.get(params.id)), "api/tenant/[id] GET");
}

// PATCH /api/tenant/[id] → currently supports completing onboarding. platform.manage.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { completeOnboarding?: boolean };
    if (body.completeOnboarding) {
      return ok(await tenantService.completeOnboarding(params.id));
    }
    return fail("Tidak ada perubahan yang dikenali", 400, "no_op");
  }, "api/tenant/[id] PATCH");
}

// DELETE /api/tenant/[id]        → SOFT delete (sets deleted_at).
// DELETE /api/tenant/[id]?purge=1 → HARD delete (permanent row removal).
// Both superadmin-only (platform.manage). The dedicated POST/DELETE
// /api/tenant/[id]/purge route is the explicit alias for the hard path.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await tenantService.hardDelete(params.id, g.ctx.userId);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await tenantService.softDelete(params.id, g.ctx.userId);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/tenant/[id] DELETE");
}
