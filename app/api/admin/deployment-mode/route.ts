import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { getDeploymentMode, setSetting } from "@/lib/platform/settings";

export const runtime = "nodejs";

// GET/PUT /api/admin/deployment-mode (doc 41) — superadmin sets saas | on_prem.
// on_prem disables the cross-tenant marketplace.
export async function GET() {
  const guard = await requirePermission("platform.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ mode: "saas", source: "mock" });
  return NextResponse.json({ mode: await getDeploymentMode(), source: "db" });
}

export async function PUT(req: Request) {
  const guard = await requirePermission("platform.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const mode = body.mode === "on_prem" ? "on_prem" : "saas";
  await setSetting("deployment_mode", mode);
  return NextResponse.json({ ok: true, mode });
}
