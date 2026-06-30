import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import {
  companyTable,
  productTable,
  positioningInsightTable,
} from "@/lib/db/schema";
import { generatePositioning, storePositioning } from "@/lib/positioning/engine";
import type { Company, Product } from "@/lib/types/profiling";

export const runtime = "nodejs";

// GET /api/db/positioning?companyId=… → stored insights for the tenant.
export async function GET(req: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ data: [], source: "mock" });
  if (!hasDb()) return NextResponse.json({ data: [], source: "mock" });
  const companyId = new URL(req.url).searchParams.get("companyId");
  try {
    const data = await withTenant(ctx, (tx) =>
      companyId
        ? tx.select().from(positioningInsightTable).where(eq(positioningInsightTable.companyId, companyId))
        : tx.select().from(positioningInsightTable),
    );
    return NextResponse.json({ data, source: "db" });
  } catch (err) {
    console.error("[api/db/positioning GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}

// POST /api/db/positioning { companyId, productId? } → generate (AI or heuristic)
// + store the insight for company × product.
export async function POST(req: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const body = (await req.json()) as { companyId?: string; productId?: string };
    if (!body?.companyId) return NextResponse.json({ error: "Missing companyId" }, { status: 400 });

    const ctxData = await withTenant(ctx, async (tx) => {
      const co = await tx.select().from(companyTable).where(eq(companyTable.id, body.companyId!)).limit(1);
      const prod = body.productId
        ? await tx.select().from(productTable).where(eq(productTable.id, body.productId)).limit(1)
        : await tx.select().from(productTable).limit(1);
      return { company: co[0] ?? null, product: prod[0] ?? null };
    });
    if (!ctxData.company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    if (!ctxData.product) return NextResponse.json({ error: "No product configured" }, { status: 400 });

    const gen = await generatePositioning(
      ctx,
      ctxData.company as unknown as Company,
      ctxData.product as unknown as Product,
    );
    const id = await storePositioning(ctx, ctxData.company.id, ctxData.product.id, gen);

    return NextResponse.json({ ok: true, id, source: gen.source, model: gen.generatedBy, insight: gen.insight });
  } catch (err) {
    console.error("[api/db/positioning POST]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
