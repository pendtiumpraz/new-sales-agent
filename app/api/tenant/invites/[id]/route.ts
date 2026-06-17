import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { invitesTable } from "@/lib/db/schema";

export const runtime = "nodejs";

// DELETE /api/tenant/invites/:id → revoke a pending invite.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("tenant.members.manage");
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    await withTenant(ctx, (tx) =>
      tx
        .update(invitesTable)
        .set({ status: "revoked" })
        .where(and(eq(invitesTable.id, params.id), eq(invitesTable.tenantId, ctx.tenantId))), // tenant guard
    );
    return NextResponse.json({ ok: true, source: "db" });
  } catch (err) {
    console.error("[api/tenant/invites/[id] DELETE]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
