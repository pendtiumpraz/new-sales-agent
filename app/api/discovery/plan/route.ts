import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac/guard";
import { planDiscovery } from "@/lib/discovery/plan";

export const runtime = "nodejs";

// POST /api/discovery/plan (doc 40) — AI discovery planner: a field/profession +
// Indonesian location → an actionable hunt plan (titles, industries, candidate
// companies, LinkedIn queries). No DB needed — pure metered-AI planning. The
// real people come from the extension / crawl, not from this response.
export async function POST(req: Request) {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;

  const body = (await req.json().catch(() => ({}))) as { field?: string; location?: string; seniority?: string };
  if (!body.field || !body.field.trim()) {
    return NextResponse.json({ error: "Bidang/pekerjaan wajib diisi" }, { status: 400 });
  }

  try {
    const plan = await planDiscovery(ctx, {
      field: body.field,
      location: body.location ?? "Indonesia",
      seniority: body.seniority ?? null,
    });
    return NextResponse.json({ ok: true, plan });
  } catch (err) {
    console.error("[api/discovery/plan POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
