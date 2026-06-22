import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { getSetting, setSetting } from "@/lib/wa/store";

export const runtime = "nodejs";

const keyFor = (tenantId: string) => `wa_reply_mode:${tenantId}`;

// GET /api/wa/mode → "auto" (auto-send) | "semi" (draft needs rep approval).
export async function GET() {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ mode: "auto", source: "mock" });
  const v = await getSetting(keyFor(guard.ctx.tenantId));
  return NextResponse.json({ mode: v === "semi" ? "semi" : "auto" });
}

// PUT /api/wa/mode { mode } — owner/admin only.
export async function PUT(req: Request) {
  const guard = await requirePermission("tenant.settings.manage");
  if ("error" in guard) return guard.error;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const body = (await req.json().catch(() => null)) as { mode?: string } | null;
  const mode = body?.mode === "semi" ? "semi" : "auto";
  await setSetting(keyFor(guard.ctx.tenantId), mode);
  return NextResponse.json({ ok: true, mode });
}
