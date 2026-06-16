import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { membershipsTable } from "@/lib/db/schema";
import type { Role } from "@/lib/rbac/permissions";

export const runtime = "nodejs";

// PATCH /api/tenant/members/:id → change a member's role. Body = { role }.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("tenant.members.manage");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const body = (await req.json()) as { role?: Role };
    if (!body?.role) return NextResponse.json({ error: "Missing role" }, { status: 400 });
    await withTenant(ctx, (tx) =>
      tx
        .update(membershipsTable)
        .set({ role: body.role! })
        .where(and(eq(membershipsTable.id, params.id), eq(membershipsTable.tenantId, ctx.tenantId))),
    );
    return NextResponse.json({ ok: true, source: "db" });
  } catch (err) {
    console.error("[api/tenant/members/[id] PATCH]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// DELETE /api/tenant/members/:id → remove a member.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("tenant.members.manage");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    await withTenant(ctx, (tx) =>
      tx.delete(membershipsTable).where(and(eq(membershipsTable.id, params.id), eq(membershipsTable.tenantId, ctx.tenantId))),
    );
    return NextResponse.json({ ok: true, source: "db" });
  } catch (err) {
    console.error("[api/tenant/members/[id] DELETE]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
