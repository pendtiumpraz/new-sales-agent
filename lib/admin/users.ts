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

const COLORS = ["#FB5E3B", "#14B8A6", "#F59E0B", "#3B82F6", "#8B5CF6"];

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  // New-tenant mode (provision a fresh account):
  company?: string;
  plan?: string;
  // Existing-tenant mode (add a user into a tenant):
  tenantId?: string;
  role?: string; // membership role (tenant_owner | tenant_admin | member)
}

// Superadmin direct provisioning (doc 41). Creates a user + membership; if no
// tenantId is given, also creates a new ACTIVE tenant with this user as owner.
// Cross-tenant → uses the raw `db` (like the rest of this module).
export async function createAdminUser(
  input: CreateUserInput,
): Promise<{ userId: string; tenantId: string; role: string }> {
  const email = input.email.trim().toLowerCase();
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing.length) throw new Error("Email sudah terdaftar.");

  const userId = "u_" + crypto.randomUUID().slice(0, 12);
  const avatarColor = COLORS[email.length % COLORS.length];

  let tenantId = input.tenantId ?? null;
  let role = input.role ?? "member";
  if (!tenantId) {
    if (!input.company?.trim()) throw new Error("Nama perusahaan wajib untuk tenant baru.");
    tenantId = "t_" + crypto.randomUUID().slice(0, 12);
    role = "tenant_owner";
    await db.insert(tenantsTable).values({
      id: tenantId,
      name: input.company.trim(),
      plan: input.plan ?? "starter",
      status: "active",
    });
  }

  await db.insert(usersTable).values({
    id: userId,
    name: input.name.trim(),
    email,
    password: input.password,
    role,
    avatarColor,
  });
  await db.insert(membershipsTable).values({
    id: "m_" + crypto.randomUUID().slice(0, 12),
    tenantId,
    userId,
    role,
    status: "active",
  });
  return { userId, tenantId, role };
}
