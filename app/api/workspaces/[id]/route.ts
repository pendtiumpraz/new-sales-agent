import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { companyTable, personTable } from "@/lib/db/schema";
import { isManager, listTenantMembers } from "@/lib/team/members";
import {
  getWorkspace,
  updateWorkspace,
  archiveWorkspace,
  type WorkspaceType,
} from "@/lib/workspace/store";

export const runtime = "nodejs";

const TYPES: WorkspaceType[] = ["lead_gen", "partner", "offering", "retention", "custom"];

// GET /api/workspaces/:id (doc 44) — one workspace + the leads scoped to it
// (person.workspaceId = id). getWorkspace already enforces owner-or-manager:
// a member reading someone else's workspace gets null → 404 here.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ data: null, source: "mock" });

  try {
    const ws = await getWorkspace(ctx, params.id);
    if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const members = await listTenantMembers(ctx);
    const ownerName = members.find((m) => m.userId === ws.ownerUserId)?.name ?? null;

    const leads = await withTenant(ctx, (tx) =>
      tx
        .select({
          id: personTable.id,
          fullName: personTable.fullName,
          title: personTable.title,
          companyId: personTable.companyId,
          // B2B qualifier — resolve the company name so the hub table can show
          // it (was only id+title, hard to triage). LEFT JOIN: leads without a
          // company still appear.
          companyName: companyTable.name,
          leadType: personTable.leadType,
        })
        .from(personTable)
        .leftJoin(companyTable, eq(companyTable.id, personTable.companyId))
        // Don't count/list soft-deleted people in the workspace hub.
        .where(and(eq(personTable.workspaceId, params.id), isNull(personTable.deletedAt))),
    );

    return NextResponse.json({ data: { ...ws, ownerName, leadCount: leads.length, leads }, source: "db" });
  } catch (err) {
    console.error("[api/workspaces/[id] GET]", err);
    return NextResponse.json({ data: null, source: "error" });
  }
}

// PATCH /api/workspaces/:id — update name/type/product/targetSegment/status.
// Members may only modify their own workspace (403 otherwise); managers any in
// the tenant. We check ownership up front so the rep gets a clear 403.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  try {
    const existing = await getWorkspace(ctx, params.id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!isManager(ctx.role) && existing.ownerUserId !== ctx.userId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      type?: string;
      productId?: string | null;
      targetSegment?: string | null;
      status?: string;
    };

    const ws = await updateWorkspace(ctx, params.id, {
      name: body.name?.trim() || undefined,
      type: TYPES.includes(body.type as WorkspaceType) ? (body.type as WorkspaceType) : undefined,
      productId: body.productId === undefined ? undefined : body.productId?.trim() || null,
      targetSegment: body.targetSegment === undefined ? undefined : body.targetSegment?.trim() || null,
      status: body.status,
    });
    return NextResponse.json({ ok: true, data: ws, source: "db" });
  } catch (err) {
    console.error("[api/workspaces/[id] PATCH]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// DELETE /api/workspaces/:id — archive (status → archived), not a hard delete, so
// the leads scoped to it keep their workspaceId. Same owner-or-manager guard.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  try {
    const existing = await getWorkspace(ctx, params.id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!isManager(ctx.role) && existing.ownerUserId !== ctx.userId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const ws = await archiveWorkspace(ctx, params.id);
    return NextResponse.json({ ok: true, data: ws, source: "db" });
  } catch (err) {
    console.error("[api/workspaces/[id] DELETE]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
