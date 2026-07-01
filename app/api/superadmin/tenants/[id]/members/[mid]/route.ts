import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { superadminService } from "@/modules/superadmin/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string; mid: string };
}

// PATCH /api/superadmin/tenants/[id]/members/[mid] → change a target member's
// role and/or seat status. Body: { role?, status? }. role ∈ {member,tenant_admin,
// tenant_owner}, status ∈ {active,disabled}. No role ceiling (superadmin outranks
// every tenant role). platform.manage only.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      role?: string;
      status?: string;
    };
    const row = await superadminService.updateTenantMember(
      g.ctx,
      params.id,
      params.mid,
      body,
      g.ctx.userId,
    );
    return ok(row);
  }, "api/superadmin/tenants/[id]/members/[mid] PATCH");
}

// DELETE /api/superadmin/tenants/[id]/members/[mid] → remove a member from a
// target tenant (hard delete of the membership row). platform.manage only.
export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    await superadminService.removeTenantMember(g.ctx, params.id, params.mid, g.ctx.userId);
    return ok({ removed: true });
  }, "api/superadmin/tenants/[id]/members/[mid] DELETE");
}
