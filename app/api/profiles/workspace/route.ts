import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { personTable } from "@/lib/db/schema";

export const runtime = "nodejs";

// POST /api/profiles/workspace (doc 44) — tag/untag a lead to a workspace.
//   { personId, workspaceId }  (workspaceId null → remove from workspace)
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const body = (await req.json().catch(() => ({}))) as { personId?: string; workspaceId?: string | null };
  if (!body.personId) return NextResponse.json({ error: "personId wajib" }, { status: 400 });

  try {
    await withTenant(ctx, (tx) =>
      tx
        .update(personTable)
        .set({ workspaceId: body.workspaceId ?? null, updatedAt: new Date() })
        .where(and(eq(personTable.id, body.personId!), eq(personTable.tenantId, ctx.tenantId))),
    );
    return NextResponse.json({ ok: true, personId: body.personId, workspaceId: body.workspaceId ?? null });
  } catch (err) {
    console.error("[api/profiles/workspace POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
