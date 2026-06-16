import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { getWaMode, setSetting } from "@/lib/wa/store";

export const runtime = "nodejs";

// GET/PUT /api/admin/wa-mode (doc 41) — superadmin sets how WhatsApp works:
// per_sales (each rep links their own number) vs per_platform (one shared number).
export async function GET() {
  const guard = await requirePermission("platform.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ mode: "per_platform", source: "mock" });
  return NextResponse.json({ mode: await getWaMode(), source: "db" });
}

export async function PUT(req: Request) {
  const guard = await requirePermission("platform.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const mode = body.mode === "per_sales" ? "per_sales" : "per_platform";
  await setSetting("wa_mode", mode);
  return NextResponse.json({ ok: true, mode });
}
