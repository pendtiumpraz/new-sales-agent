import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { exportSubject, deleteSubject } from "@/lib/compliance/dsar";
import { purgeOlderThan } from "@/lib/compliance/retention";
import { recentAudit } from "@/lib/compliance/audit";

export const runtime = "nodejs";

// GET /api/tenant/compliance → recent audit log (data.export gate).
export async function GET() {
  const guard = await requirePermission("data.export");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ audit: [], source: "mock" });
  try {
    const audit = await recentAudit(guard.ctx);
    return NextResponse.json({ audit, source: "db" });
  } catch (err) {
    console.error("[api/tenant/compliance GET]", err);
    return NextResponse.json({ audit: [], source: "error" });
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
