import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { productTable, personTable } from "@/lib/db/schema";
import { listTenantMembers } from "@/lib/team/members";
import { listWorkspaces, createWorkspace, type WorkspaceType } from "@/lib/workspace/store";

export const runtime = "nodejs";

const TYPES: WorkspaceType[] = ["lead_gen", "partner", "offering", "retention", "custom"];

// GET /api/workspaces (doc 44) — workspaces visible to the caller, each shaped
// with leadCount (person.workspaceId) + ownerName. Managers see every workspace
// in the tenant; a member only their own (scoping lives in listWorkspaces).
// We also return the tenant's `products` (for the create-dialog product picker —
// there's no standalone /api/db/products endpoint) and `members` (so a manager
// can read which rep owns each workspace). Reads gated by data.read.
export async function GET() {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ data: [], products: [], source: "mock" });

  try {
    const [workspaces, members] = await Promise.all([listWorkspaces(ctx), listTenantMembers(ctx)]);

    const { products, leadRows } = await withTenant(ctx, async (tx) => {
      const products = await tx
        .select({ id: productTable.id, name: productTable.name, category: productTable.category })
        .from(productTable);
      const leadRows = await tx
        .select({ workspaceId: personTable.workspaceId })
        .from(personTable);
      return { products, leadRows };
    });

    const leadCount = new Map<string, number>();
    for (const r of leadRows) {
      if (!r.workspaceId) continue;
      leadCount.set(r.workspaceId, (leadCount.get(r.workspaceId) ?? 0) + 1);
    }
    const ownerName = new Map(members.map((m) => [m.userId, m.name]));
    const productName = new Map(products.map((p) => [p.id, p.name]));

    const data = workspaces.map((w) => ({
      ...w,
      leadCount: leadCount.get(w.id) ?? 0,
      ownerName: ownerName.get(w.ownerUserId) ?? null,
      productName: w.productId ? productName.get(w.productId) ?? null : null,
    }));

    return NextResponse.json({ data, products, source: "db" });
  } catch (err) {
    console.error("[api/workspaces GET]", err);
    return NextResponse.json({ data: [], products: [], source: "error" });
  }
}

// POST /api/workspaces — create a workspace owned by the caller (ownerUserId =
// ctx.userId). Any data.write user (incl. reps) may create their own.
export async function POST(req: Request) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    type?: string;
    productId?: string | null;
    targetSegment?: string | null;
  };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 });
  const type = (TYPES.includes(body.type as WorkspaceType) ? body.type : "lead_gen") as WorkspaceType;

  try {
    const ws = await createWorkspace(ctx, {
      name,
      type,
      productId: body.productId?.trim() || null,
      targetSegment: body.targetSegment?.trim() || null,
    });
    return NextResponse.json({ ok: true, data: ws, source: "db" });
  } catch (err) {
    console.error("[api/workspaces POST]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
