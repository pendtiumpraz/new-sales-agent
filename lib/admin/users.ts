import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { usersTable, membershipsTable, tenantsTable } from "@/lib/db/schema";

// Superadmin user management (doc 41). Cross-tenant, so it uses the raw `db`
// (like lib/auth). A superadmin user may have NO membership (org_id kosong) —
// platform-level, belongs to no tenant.

export interface UserMembership {
  tenantId: string;
  tenantName: string;
  role: string;
  status: string;
}
export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string; // the user's global/display role
  memberships: UserMembership[];
}

export async function listAllUsers(): Promise<AdminUserRow[]> {
  const [users, mems] = await Promise.all([
    db.select().from(usersTable),
    db
      .select({
        userId: membershipsTable.userId,
        tenantId: membershipsTable.tenantId,
        role: membershipsTable.role,
        status: membershipsTable.status,
        tenantName: tenantsTable.name,
      })
      .from(membershipsTable)
      .innerJoin(tenantsTable, eq(tenantsTable.id, membershipsTable.tenantId)),
  ]);

  const byUser = new Map<string, UserMembership[]>();
  for (const m of mems) {
    const list = byUser.get(m.userId) ?? [];
    list.push({ tenantId: m.tenantId, tenantName: m.tenantName, role: m.role, status: m.status });
    byUser.set(m.userId, list);
  }

  return users
    .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, memberships: byUser.get(u.id) ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Is `userId` a member of `tenantId`? (gate tenant-admin password changes.)
export async function isMemberOfTenant(userId: string, tenantId: string): Promise<boolean> {
  const mems = await db
    .select({ tenantId: membershipsTable.tenantId })
    .from(membershipsTable)
    .where(eq(membershipsTable.userId, userId));
  return mems.some((m) => m.tenantId === tenantId);
}

// Demo app: passwords are plaintext (see schema). Real prod would bcrypt here.
export async function setUserPassword(userId: string, password: string): Promise<void> {
  await db.update(usersTable).set({ password, updatedAt: new Date() }).where(eq(usersTable.id, userId));
}
