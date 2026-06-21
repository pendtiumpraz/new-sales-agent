import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/auth/session-context";
import { analyzeMarketFit, heuristicMarketFit } from "@/lib/market-fit/analyzer";
import { CLOSING_TECHNIQUES_17 } from "@/lib/kb/closing-techniques";
import type { MarketFitInput } from "@/lib/types/market-fit";

export const runtime = "nodejs";

// POST /api/market-fit (Phase 2) — classify a product as B2B/B2C/mix + ICP +
// segment fit. Uses the tenant's AI when logged in; falls back to the offline
// heuristic otherwise (so it stays demoable without a session). Body:
//   { productName, productDescription, segments?[] }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<MarketFitInput> | null;
  if (!body?.productName || !body?.productDescription) {
    return NextResponse.json(
      { error: "productName + productDescription wajib" },
      { status: 400 },
    );
  }

  const input: MarketFitInput = {
    productName: body.productName,
    productDescription: body.productDescription,
    segments: Array.isArray(body.segments) ? body.segments : [],
  };

  const ctx = await getTenantContext();
  const result = ctx ? await analyzeMarketFit(ctx, input) : heuristicMarketFit(input);

  // Close the loop: which of the 17 closing techniques fit this market type
  // (aggressive ones are B2C-only → dropped for B2B).
  const allowedTechniques = CLOSING_TECHNIQUES_17.filter(
    (t) => result.marketType === "mix" || t.cocokUntuk.includes(result.marketType),
  ).map((t) => ({ id: t.id, nama: t.nama }));

  return NextResponse.json({ result, allowedTechniques });
}
