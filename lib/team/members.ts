import { and, eq } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { membershipsTable, usersTable } from "@/lib/db/schema";

// Roles that can SELL + manage the whole tenant (see all data). Everyone else
// (member = sales rep) is scoped to their own assigned leads (doc 41 §2).
export const MANAGER_ROLES = ["superadmin", "tenant_owner", "tenant_admin"] as const;

export function isManager(role: string | undefined | null): boolean {
  return MANAGER_ROLES.includes(role as (typeof MANAGER_ROLES)[number]);
}

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  avatarColor: string | null;
}

// All active members of the tenant (memberships ⋈ users), for the assign
// dropdown + the monitoring roster.
export async function listTenantMembers(ctx: TenantContext): Promise<TeamMember[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        userId: membershipsTable.userId,
        role: membershipsTable.role,
        name: usersTable.name,
        email: usersTable.email,
        avatarColor: usersTable.avatarColor,
      })
      .from(membershipsTable)
      .innerJoin(usersTable, eq(usersTable.id, membershipsTable.userId))
      .where(and(eq(membershipsTable.tenantId, ctx.tenantId), eq(membershipsTable.status, "active")));
    return rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      email: r.email,
      role: r.role,
      avatarColor: r.avatarColor,
    }));
  });
}
