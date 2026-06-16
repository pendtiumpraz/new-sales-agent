import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { disabledForTenant } from "@/lib/entitlements";

export const runtime = "nodejs";

// GET /api/tenant/entitlements (doc 44) — which modules are disabled for the
// current tenant, so the sidebar can hide them. Any signed-in user may read.
export async function GET() {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ disabled: [], source: "mock" });
  return NextResponse.json({ disabled: await disabledForTenant(guard.ctx.tenantId), source: "db" });
}
