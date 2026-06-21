import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";
import { getWorkspace } from "@/lib/workspace/store";
import { analyzeMarketFit } from "@/lib/market-fit/analyzer";
import { saveMarketFit, loadMarketFit } from "@/lib/market-fit/store";
import { CLOSING_TECHNIQUES_17 } from "@/lib/kb/closing-techniques";
import type { MarketFitInput, MarketFitResult } from "@/lib/types/market-fit";

export const runtime = "nodejs";

// Which of the 17 closing techniques fit this market (aggressive → B2C-only).
function allowedTechniques(result: MarketFitResult) {
  return CLOSING_TECHNIQUES_17.filter(
    (t) => result.marketType === "mix" || t.cocokUntuk.includes(result.marketType),
  ).map((t) => ({ id: t.id, nama: t.nama }));
}

// GET /api/workspaces/:id/market-fit — load the saved result (or null).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("data.read");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ result: null, source: "mock" });

  const ws = await getWorkspace(ctx, params.id);
  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await loadMarketFit(params.id);
  return NextResponse.json({
    result,
    allowedTechniques: result ? allowedTechniques(result) : [],
  });
}

// POST /api/workspaces/:id/market-fit — run the analyzer for this workspace's
// product + segments and persist the result. Body = { productName, productDescription, segments[] }.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requirePermission("data.write");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });

  const ws = await getWorkspace(ctx, params.id);
  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Partial<MarketFitInput> | null;
  if (!body?.productName || !body?.productDescription) {
    return NextResponse.json(
      { error: "productName + productDescription wajib (hubungkan produk ke workspace dulu)" },
      { status: 400 },
    );
  }

  const input: MarketFitInput = {
    productName: body.productName,
    productDescription: body.productDescription,
    segments: Array.isArray(body.segments) ? body.segments : [],
  };

  const result = await analyzeMarketFit(ctx, input);
  await saveMarketFit(params.id, result);
  return NextResponse.json({ ok: true, result, allowedTechniques: allowedTechniques(result) });
}
