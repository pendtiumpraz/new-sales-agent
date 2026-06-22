import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { getWorkspace } from "@/lib/workspace/store";
import { loadSalesPlay, saveSalesPlay } from "@/lib/sales-play/store";
import { loadMarketFit } from "@/lib/market-fit/store";
import { defaultSalesPlay } from "@/lib/sales-play/default";
import type { SalesPlay } from "@/lib/types/sales-play";

export const runtime = "nodejs";

// GET /api/workspaces/:id/sales-play — saved plan, or a default seeded from the
// workspace's market-fit type (so the editor always has something to edit).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ plan: defaultSalesPlay(), source: "mock" });

  const ws = await getWorkspace(ctx, params.id);
  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let plan = await loadSalesPlay(params.id);
  if (!plan) {
    const mf = await loadMarketFit(params.id);
    plan = defaultSalesPlay(mf?.marketType ?? "mix", {
      workspaceId: params.id,
      productId: ws.productId ?? undefined,
    });
  }
  return NextResponse.json({ plan });
}

// PUT /api/workspaces/:id/sales-play — save the edited plan.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const ws = await getWorkspace(ctx, params.id);
  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { plan?: SalesPlay } | null;
  if (!body?.plan) return NextResponse.json({ error: "plan wajib" }, { status: 400 });

  await saveSalesPlay(params.id, { ...body.plan, workspaceId: params.id });
  return NextResponse.json({ ok: true });
}
