import { and, eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { membershipTable } from "@/modules/tenant/schema";
import { ok, handle, ServiceError } from "@/modules/_shared/api";
import type { Role } from "@/lib/rbac/permissions";

export const runtime = "nodejs";

// Membership roles a tenant manager may ASSIGN via this route. `superadmin` is a
// platform role and is deliberately NOT assignable from tenant member management
// (audit #21). Each role carries a numeric rank for the ceiling check below.
const ASSIGNABLE_ROLES: Record<Exclude<Role, "superadmin">, number> = {
  member: 1,
  tenant_admin: 2,
  tenant_owner: 3,
};

// Rank of the ACTING principal (canonical RBAC role on the session). superadmin
// outranks everyone; only `tenant.members.manage` holders reach this route.
const ACTOR_RANK: Record<Role, number> = {
  member: 1,
  tenant_admin: 2,
  tenant_owner: 3,
  superadmin: 4,
};

function isAssignableRole(value: unknown): value is Exclude<Role, "superadmin"> {
  return typeof value === "string" && value in ASSIGNABLE_ROLES;
}

// PATCH /api/tenant/members/:id → change a member's role and/or seat status.
// Body = { role? , status? }. status ∈ "active" | "disabled" — disabling keeps
// the membership (seat suspended) instead of deleting it.
//
// Authz (audit #21): `role` is validated against an explicit membership-role
// allow-list and a ROLE CEILING — an actor can never assign a role ranked above
// their own, so a tenant_admin cannot promote anyone (incl. themselves) to
// tenant_owner. Promoting to tenant_owner (owner-transfer) is therefore an
// owner/superadmin-only action.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("tenant.members.manage");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return ok({ source: "mock" });
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      role?: unknown;
      status?: unknown;
    };
    if (body.role === undefined && body.status === undefined) {
      throw new ServiceError("Role atau status wajib diisi", 400, "validation");
    }

    const patch: { role?: Role; status?: "active" | "disabled" } = {};

    if (body.role !== undefined) {
      if (!isAssignableRole(body.role)) {
        throw new ServiceError("Role tidak valid", 400, "invalid_role");
      }
      // Role ceiling: never assign a role ranked above the actor's own (owner
      // transfer = owner/superadmin only).
      const actorRank = ACTOR_RANK[ctx.role as Role] ?? 0;
      if (ASSIGNABLE_ROLES[body.role] > actorRank) {
        throw new ServiceError(
          "Tidak boleh memberi peran di atas peran Anda",
          403,
          "role_ceiling",
        );
      }
      patch.role = body.role;
    }

    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "disabled") {
        throw new ServiceError("Status tidak valid", 400, "validation");
      }
      patch.status = body.status;
    }

    await withTenant(ctx, (tx) =>
      tx
        .update(membershipTable)
        .set(patch)
        .where(
          and(eq(membershipTable.id, params.id), eq(membershipTable.tenantId, ctx.tenantId)),
        ),
    );
    return ok({ source: "db" });
  }, "api/tenant/members/[id] PATCH");
}

// DELETE /api/tenant/members/:id → remove a member.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("tenant.members.manage");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return ok({ source: "mock" });
  return handle(async () => {
    await withTenant(ctx, (tx) =>
      tx
        .delete(membershipTable)
        .where(
          and(eq(membershipTable.id, params.id), eq(membershipTable.tenantId, ctx.tenantId)),
        ),
    );
    return ok({ source: "db" });
  }, "api/tenant/members/[id] DELETE");
}
