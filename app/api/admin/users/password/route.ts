import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { isMemberOfTenant, setUserPassword } from "@/lib/admin/users";

export const runtime = "nodejs";

// POST /api/admin/users/password (doc 41) — change a user's password.
//   superadmin → any user; tenant manager → only users in their own tenant.
// tenant.members.manage-gated (members/sales reps can't reach it).
export async function POST(req: Request) {
  const guard = await requirePermission("tenant.members.manage");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const body = (await req.json().catch(() => ({}))) as { userId?: string; password?: string };
  if (!body.userId || !body.password || body.password.length < 6) {
    return NextResponse.json({ error: "userId + password (min 6 karakter) wajib" }, { status: 400 });
  }

  // Non-superadmins may only reset passwords for users inside their own tenant.
  if (ctx.role !== "superadmin") {
    const ok = await isMemberOfTenant(body.userId, ctx.tenantId);
    if (!ok) return NextResponse.json({ error: "User di luar tenant Anda" }, { status: 403 });
  }

  try {
    await setUserPassword(body.userId, body.password);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/users/password POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
