import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { tenantsTable } from "@/lib/db/schema";
import { adminOverview } from "@/lib/admin/overview";
import { grantCredit } from "@/lib/billing/credit";
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
    const b = (await req.json()) as {
      tenantId?: string;
      action?: "suspend" | "activate" | "grant_credit" | "activate_until";
      tokens?: number;
      reason?: string;
      until?: string; // ISO date for activate_until
    };
    if (!b?.tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

    // Activate a (pending/expired) tenant until a date (doc 38).
    if (b.action === "activate_until") {
      const until = b.until ? new Date(b.until) : null;
      if (until && Number.isNaN(until.getTime())) {
        return NextResponse.json({ error: "Tanggal tidak valid" }, { status: 400 });
      }
      await withTenant(ctx, (tx) =>
        tx.update(tenantsTable).set({ status: "active", activeUntil: until }).where(eq(tenantsTable.id, b.tenantId!)),
      );
      await recordAudit(ctx, "tenant.activate_until", b.tenantId, { until: b.until ?? null });
      return NextResponse.json({ ok: true });
    }

    if (b.action === "grant_credit") {
      const tokens = Number(b.tokens);
      if (!Number.isFinite(tokens) || tokens === 0) {
        return NextResponse.json({ error: "tokens tidak valid" }, { status: 400 });
      }
      await grantCredit(ctx, b.tenantId, tokens, b.reason);
      await recordAudit(ctx, "credit.grant", b.tenantId, { tokens });
      return NextResponse.json({ ok: true });
    }

    if (b.action === "suspend" || b.action === "activate") {
      const status = b.action === "suspend" ? "suspended" : "active";
      await withTenant(ctx, (tx) => tx.update(tenantsTable).set({ status }).where(eq(tenantsTable.id, b.tenantId!)));
      await recordAudit(ctx, `tenant.${b.action}`, b.tenantId, {});
      return NextResponse.json({ ok: true, status });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  } catch (err) {
    console.error("[api/admin POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
