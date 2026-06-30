import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { personTable } from "@/lib/db/schema";
import { isManager } from "@/lib/team/members";

export const runtime = "nodejs";

// POST /api/profiles/assign (doc 41) — assign a lead (person) to a sales rep.
//   { personId, assignedTo }  (assignedTo = users.id, or null to unassign)
// A manager can assign to anyone; a rep may only claim a lead for themselves.
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const body = (await req.json().catch(() => ({}))) as { personId?: string; assignedTo?: string | null };
  if (!body.personId) return NextResponse.json({ error: "personId wajib" }, { status: 400 });

  // A rep can only assign to themselves (or unassign their own); managers: anyone.
  const target = body.assignedTo ?? null;
  if (!isManager(ctx.role) && target && target !== ctx.userId) {
    return NextResponse.json({ error: "Sales hanya boleh klaim lead untuk dirinya sendiri" }, { status: 403 });
  }

  try {
    await withTenant(ctx, (tx) =>
      tx
        .update(personTable)
        .set({ assignedTo: target, updatedAt: new Date() })
        .where(and(eq(personTable.id, body.personId!), eq(personTable.tenantId, ctx.tenantId))),
    );
    return NextResponse.json({ ok: true, personId: body.personId, assignedTo: target });
  } catch (err) {
    console.error("[api/profiles/assign POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
