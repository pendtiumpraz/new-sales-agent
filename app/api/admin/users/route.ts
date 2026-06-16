import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { listAllUsers } from "@/lib/admin/users";

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
