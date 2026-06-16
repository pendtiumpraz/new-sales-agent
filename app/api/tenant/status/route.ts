import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { getTenantContext } from "@/lib/auth/session-context";
import { tenantActivation } from "@/lib/admin/kill-switch";

export const runtime = "nodejs";

// GET /api/tenant/status → activation status of the current tenant (doc 38).
// Drives the app-shell gate that redirects pending/expired tenants to /pending.
// Fails OPEN (active:true) on errors so a glitch never locks a real user out.
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx || !hasDb()) return NextResponse.json({ active: true, reason: "ok" });
  try {
    const a = await tenantActivation(ctx);
    return NextResponse.json({
      active: a.active,
      status: a.status,
      activeUntil: a.activeUntil,
      reason: a.reason,
    });
  } catch (err) {
    console.error("[api/tenant/status]", err);
    return NextResponse.json({ active: true, reason: "error" });
  }
}
