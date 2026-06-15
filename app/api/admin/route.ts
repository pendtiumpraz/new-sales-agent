import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { tenantsTable } from "@/lib/db/schema";
import { adminOverview } from "@/lib/admin/overview";
import { recentAudit, recordAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";

// GET /api/admin → cross-tenant rollup + recent audit. Superadmin only.
export async function GET() {
  const guard = await requirePermission("platform.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ tenants: [], totals: null, audit: [], source: "mock" });
  try {
    const overview = await adminOverview(guard.ctx);
    const audit = await recentAudit(guard.ctx, 30);
    return NextResponse.json({ ...overview, audit, source: "db" });
  } catch (err) {
    console.error("[api/admin GET]", err);
    return NextResponse.json({ tenants: [], totals: null, audit: [], source: "error" });
  }
}

// POST /api/admin → kill-switch: suspend/activate a tenant. Superadmin only.
// Body { tenantId, action: "suspend" | "activate" }.
export async function POST(req: Request) {
  const guard = await requirePermission("platform.manage");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const b = (await req.json()) as { tenantId?: string; action?: "suspend" | "activate" };
    if (!b?.tenantId || !["suspend", "activate"].includes(b.action ?? "")) {
      return NextResponse.json({ error: "Missing tenantId/action" }, { status: 400 });
    }
    const status = b.action === "suspend" ? "suspended" : "active";
    await withTenant(ctx, (tx) => tx.update(tenantsTable).set({ status }).where(eq(tenantsTable.id, b.tenantId!)));
    await recordAudit(ctx, `tenant.${b.action}`, b.tenantId, {});
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    console.error("[api/admin POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
