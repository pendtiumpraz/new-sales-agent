import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { requirePermission } from "@/lib/rbac/guard";
import { membershipsTable, invitesTable } from "@/lib/db/schema";
import { DEMO_ACCOUNTS } from "@/lib/auth/demo-accounts";
import type { Role } from "@/lib/rbac/permissions";

export const runtime = "nodejs";

// GET /api/tenant/members → members + pending invites for the caller's tenant.
// Any authenticated member can view the team. Display names are resolved from
// the demo accounts by user_id (real users land here once Auth.js authorizes
// against usersTable — slice 2b OAuth).
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ members: [], invites: [], source: "mock" });
  try {
    const data = await withTenant(ctx, async (tx) => {
      const members = await tx.select().from(membershipsTable).where(eq(membershipsTable.tenantId, ctx.tenantId));
      const invites = await tx
        .select()
        .from(invitesTable)
        .where(and(eq(invitesTable.tenantId, ctx.tenantId), eq(invitesTable.status, "pending")));
      return { members, invites };
    });
    const members = data.members.map((m) => {
      const acc = DEMO_ACCOUNTS.find((a) => a.id === m.userId);
      return {
        id: m.id,
        userId: m.userId,
        role: m.role,
        status: m.status,
        name: acc?.name ?? m.userId,
        email: acc?.email ?? null,
        avatarColor: acc?.avatarColor ?? "#94a3b8",
      };
    });
    return NextResponse.json({ members, invites: data.invites, source: "db" });
  } catch (err) {
    console.error("[api/tenant/members GET]", err);
    return NextResponse.json({ members: [], invites: [], source: "error" });
  }
}

// POST /api/tenant/members → create an invite. Body = { email, role }.
// Requires tenant.members.manage.
export async function POST(req: Request) {
  const guard = await requirePermission("tenant.members.manage");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const body = (await req.json()) as { email?: string; role?: Role };
    if (!body?.email || !body?.role) {
      return NextResponse.json({ error: "Missing email or role" }, { status: 400 });
    }
    const id = "inv_" + crypto.randomUUID();
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await withTenant(ctx, (tx) =>
      tx.insert(invitesTable).values({
        id,
        tenantId: ctx.tenantId,
        email: body.email!,
        role: body.role!,
        token,
        status: "pending",
        expiresAt,
      }),
    );
    return NextResponse.json({ ok: true, id, source: "db" });
  } catch (err) {
    console.error("[api/tenant/members POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
