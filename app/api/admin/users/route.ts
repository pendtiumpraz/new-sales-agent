import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { listAllUsers, createAdminUser, type CreateUserInput } from "@/lib/admin/users";
import { recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";

// GET /api/admin/users (doc 41) — superadmin only: every user across all tenants
// with their tenant + role. Tenant-scoped user management uses /api/team/members.
export async function GET() {
  const guard = await requirePermission("platform.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });
  try {
    const data = await listAllUsers();
    return NextResponse.json({ data, source: "db" });
  } catch (err) {
    console.error("[api/admin/users GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}

// POST /api/admin/users — superadmin provisions an account directly. Body:
//   new tenant:      { name, email, password, company, plan? }
//   into a tenant:   { name, email, password, tenantId, role? }
export async function POST(req: Request) {
  const guard = await requirePermission("platform.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const body = (await req.json().catch(() => null)) as Partial<CreateUserInput> | null;
  if (!body?.name || !body?.email || !body?.password || body.password.length < 6) {
    return NextResponse.json({ error: "name + email + password (min 6 karakter) wajib" }, { status: 400 });
  }
  if (!body.tenantId && !body.company?.trim()) {
    return NextResponse.json({ error: "company (tenant baru) atau tenantId (tenant existing) wajib" }, { status: 400 });
  }

  try {
    const r = await createAdminUser(body as CreateUserInput);
    await recordAudit(guard.ctx, "user.create", r.userId, { tenantId: r.tenantId, email: body.email, role: r.role });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: msg.includes("terdaftar") ? 409 : 500 });
  }
}
