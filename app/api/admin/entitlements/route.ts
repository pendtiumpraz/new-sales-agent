import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { entitlementMatrix, setEntitlement, MODULES } from "@/lib/entitlements";

export const runtime = "nodejs";

// GET/PUT /api/admin/entitlements (doc 44) — superadmin module matrix per tenant.
export async function GET() {
  const guard = await requirePermission("platform.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ tenants: [], modules: MODULES, disabled: {}, source: "mock" });
  return NextResponse.json({ ...(await entitlementMatrix()), source: "db" });
}

export async function PUT(req: Request) {
  const guard = await requirePermission("platform.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const b = (await req.json().catch(() => ({}))) as { tenantId?: string; moduleKey?: string; enabled?: boolean };
  if (!b.tenantId || !b.moduleKey) return NextResponse.json({ error: "tenantId + moduleKey wajib" }, { status: 400 });
  await setEntitlement(b.tenantId, b.moduleKey, b.enabled !== false);
  return NextResponse.json({ ok: true });
}
