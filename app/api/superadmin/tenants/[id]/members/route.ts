import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { superadminService } from "@/modules/superadmin/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/superadmin/tenants/[id]/members → list a target tenant's members
// (membership + resolved name/email/avatar). Cross-tenant; platform.manage only.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const members = await superadminService.listTenantMembers(g.ctx, params.id);
    return ok(members);
  }, "api/superadmin/tenants/[id]/members GET");
}

// POST /api/superadmin/tenants/[id]/members → add a member to a target tenant.
// Body: { name, email, role }. Creates the user (409 if the email is taken),
// attaches an active membership, and returns the generated password ONCE so the
// operator can share it. platform.manage only.
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      email?: string;
      role?: string;
      password?: string;
    };
    const result = await superadminService.addTenantMember(
      g.ctx,
      params.id,
      {
        name: body.name ?? "",
        email: body.email ?? "",
        role: body.role ?? "",
        password: body.password,
      },
      g.ctx.userId,
    );
    return ok(result, { status: 201 });
  }, "api/superadmin/tenants/[id]/members POST");
}
