import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { setArchived, isArchivable } from "@/lib/db/soft-delete";

export const runtime = "nodejs";

// POST /api/data/archive (doc 49) — generic soft-delete / restore for any
// user-facing entity. Body = { entity, id, restore? }. restore:true clears
// deleted_at; otherwise it sets it. Tenant-scoped via setArchived.
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const body = (await req.json().catch(() => ({}))) as { entity?: string; id?: string; restore?: boolean };
  if (!body.entity || !isArchivable(body.entity)) {
    return NextResponse.json({ ok: false, error: "unknown entity" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  try {
    const matched = await setArchived(ctx, body.entity, body.id, !body.restore);
    if (!matched) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, archived: !body.restore, source: "db" });
  } catch (err) {
    console.error("[api/data/archive]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
