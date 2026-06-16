import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { listTenantMembers } from "@/lib/team/members";

export const runtime = "nodejs";

// GET /api/team/members (doc 41) — active members of the tenant, for the assign
// dropdown + monitoring roster. Any data.read user may list (so reps can assign
// to themselves / see teammates).
export async function GET() {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });
  try {
    const data = await listTenantMembers(guard.ctx);
    return NextResponse.json({ data, source: "db" });
  } catch (err) {
    console.error("[api/team/members GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}
