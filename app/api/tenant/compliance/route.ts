import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { exportSubject, deleteSubject } from "@/lib/compliance/dsar";
import { purgeOlderThan } from "@/lib/compliance/retention";
import { recentAudit } from "@/lib/compliance/audit";
import {
  consentLogTable,
  dpiaTable,
  vendorRiskTable,
  suppressionTable,
} from "@/lib/db/schema";
import {
  consentLog as seedConsent,
  dpia as seedDpia,
  vendors as seedVendors,
} from "@/lib/api-mock/data";

export const runtime = "nodejs";

// Sample erasure queue shown only when a tenant has no real suppression rows yet
// (so the screen demonstrates the flow). Real entries come from the live
// suppression table below.
const SEED_DELETION_QUEUE = [
  { label: "Hendra Wijaya", detail: "PT Sinar Mas · hak hapus (DSAR)", daysAgo: 2 },
  { label: "Nurul Aini", detail: "CV Mitra Sejahtera · hak hapus (DSAR)", daysAgo: 4 },
  { label: "Bambang Sutrisno", detail: "Koperasi Karyawan · hak hapus (DSAR)", daysAgo: 6 },
];
function seedDeletionQueue() {
  const now = Date.now();
  return SEED_DELETION_QUEUE.map((r) => ({
    label: r.label,
    detail: r.detail,
    at: new Date(now - r.daysAgo * 864e5).toISOString(),
  }));
}
function reasonLabel(reason: string): string {
  switch (reason) {
    case "dsar_erasure":
    case "dsar_delete":
      return "Hak hapus (DSAR)";
    case "complaint":
      return "Komplain";
    case "bounce":
      return "Bounce";
    default:
      return "Opt-out / berhenti langganan";
  }
}
function mockPayload() {
  return {
    consentLog: seedConsent,
    dpia: seedDpia,
    vendors: seedVendors,
    deletionQueue: seedDeletionQueue(),
    audit: [] as unknown[],
    source: "mock" as const,
  };
}

// GET /api/tenant/compliance → the tenant's compliance register (consent log,
// DPIA, vendor risk), the LIVE right-to-erasure queue (from suppression), and
// the real audit trail. Per-tenant (was global mock); gated by `data.export`
// so the DPO roles (tenant_owner/tenant_admin) can reach it, not just superadmin.
export async function GET() {
  const guard = await requirePermission("data.export");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json(mockPayload());
  try {
    const data = await withTenant(ctx, async (tx) => {
      const consentLog = await tx
        .select()
        .from(consentLogTable)
        .where(eq(consentLogTable.tenantId, ctx.tenantId))
        .orderBy(desc(consentLogTable.at));
      const dpia = await tx
        .select()
        .from(dpiaTable)
        .where(eq(dpiaTable.tenantId, ctx.tenantId));
      const vendors = await tx
        .select()
        .from(vendorRiskTable)
        .where(eq(vendorRiskTable.tenantId, ctx.tenantId));
      const suppressions = await tx
        .select()
        .from(suppressionTable)
        .where(eq(suppressionTable.tenantId, ctx.tenantId))
        .orderBy(desc(suppressionTable.at))
        .limit(50);
      return { consentLog, dpia, vendors, suppressions };
    });
    const audit = await recentAudit(ctx);
    const liveQueue = data.suppressions.map((s) => ({
      label: s.email,
      detail: reasonLabel(s.reason),
      at: (s.at as Date).toISOString(),
    }));
    return NextResponse.json({
      // Reads are strictly tenant-scoped; seed-fallback per slice only while a
      // tenant has no rows of its own yet (keeps the demo populated).
      consentLog: data.consentLog.length
        ? data.consentLog.map((c) => ({
            id: c.id,
            contactName: c.contactName,
            source: c.source,
            channel: c.channel,
            ip: c.ip,
            version: c.version,
            status: c.status,
            date: (c.at as Date).toISOString(),
          }))
        : seedConsent,
      dpia: data.dpia.length ? data.dpia : seedDpia,
      vendors: data.vendors.length ? data.vendors : seedVendors,
      deletionQueue: liveQueue.length ? liveQueue : seedDeletionQueue(),
      audit,
      source: "db" as const,
    });
  } catch (err) {
    console.error("[api/tenant/compliance GET]", err);
    return NextResponse.json(mockPayload());
  }
}

// POST /api/tenant/compliance { op, email?, days? }
//   dsar-export / dsar-delete  → data.export
//   retention-purge            → tenant.settings.manage
export async function POST(req: Request) {
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const body = (await req.json().catch(() => null)) as { op?: string; email?: string; days?: number } | null;
  const op = body?.op;
  try {
    if (op === "dsar-export" || op === "dsar-delete") {
      const guard = await requirePermission("data.export");
      if ("error" in guard) return guard.error;
      if (!body?.email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
      if (op === "dsar-export") {
        return NextResponse.json({ ok: true, bundle: await exportSubject(guard.ctx, body.email) });
      }
      return NextResponse.json({ ok: true, deleted: await deleteSubject(guard.ctx, body.email) });
    }
    if (op === "retention-purge") {
      const guard = await requirePermission("tenant.settings.manage");
      if ("error" in guard) return guard.error;
      return NextResponse.json({ ok: true, purged: await purgeOlderThan(guard.ctx, Number(body?.days) || 90) });
    }
    return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  } catch (err) {
    console.error("[api/tenant/compliance POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
