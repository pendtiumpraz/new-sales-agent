import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { productTable } from "@/lib/db/schema";
import { seedProducts } from "@/lib/api-mock/enrichment";
import type { EnrichmentProduct } from "@/lib/types/enrichment";

export const runtime = "nodejs";

// Pipeline products CRUD (audit #5). Pipeline EnrichmentProducts (sellable packages
// matched against deals) persist to productTable under icp.enrichment — kept
// separate from positioning products (which have no icp.enrichment) so the two
// concepts don't collide. Soft-delete via deleted_at (doc 49).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProduct(row: any): EnrichmentProduct {
  const e = (row.icp?.enrichment ?? {}) as Partial<EnrichmentProduct>;
  return {
    id: row.id,
    name: row.name,
    description: e.description ?? row.pricingNotes ?? "—",
    priceIDR: e.priceIDR ?? 0,
    targetSegment: e.targetSegment ?? "Menengah",
    targetCompanySize: e.targetCompanySize ?? [],
    accent: e.accent,
  };
}
const icpFor = (p: EnrichmentProduct) => ({
  enrichment: { description: p.description, priceIDR: p.priceIDR, targetSegment: p.targetSegment, targetCompanySize: p.targetCompanySize, accent: p.accent },
});

// GET → tenant's pipeline products. Auto-seeds the demo packages on first load so
// they become real, editable, persistent rows (instead of an in-memory shadow).
export async function GET() {
  if (!hasDb()) return NextResponse.json({ data: seedProducts, source: "mock" });
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ data: seedProducts, source: "mock" });
  try {
    const rows = await withTenant(ctx, (tx) => tx.select().from(productTable).where(isNull(productTable.deletedAt)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enrichment = rows.filter((r) => (r.icp as any)?.enrichment).map(toProduct);
    if (enrichment.length) return NextResponse.json({ data: enrichment, source: "db" });

    await withTenant(ctx, async (tx) => {
      for (const p of seedProducts) {
        await tx
          .insert(productTable)
          .values({ id: p.id, tenantId: ctx.tenantId, name: p.name, category: p.targetSegment, pricingNotes: p.description, icp: icpFor(p), updatedAt: new Date() })
          .onConflictDoNothing();
      }
    });
    return NextResponse.json({ data: seedProducts, source: "seeded" });
  } catch (err) {
    console.error("[api/db/products GET]", err);
    return NextResponse.json({ data: seedProducts, source: "mock-fallback" });
  }
}

// PUT → upsert one product (create or edit). Body = { data: EnrichmentProduct }.
export async function PUT(req: Request) {
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const body = (await req.json()) as { data?: EnrichmentProduct };
    const p = body.data;
    if (!p?.id || !p.name) return NextResponse.json({ error: "id + name wajib" }, { status: 400 });
    await withTenant(ctx, (tx) =>
      tx
        .insert(productTable)
        .values({ id: p.id, tenantId: ctx.tenantId, name: p.name, category: p.targetSegment ?? null, pricingNotes: p.description ?? null, icp: icpFor(p), updatedAt: new Date() })
        .onConflictDoUpdate({
          target: productTable.id,
          set: { name: p.name, category: p.targetSegment ?? null, pricingNotes: p.description ?? null, icp: icpFor(p), deletedAt: null, updatedAt: new Date() },
        }),
    );
    return NextResponse.json({ ok: true, source: "db" });
  } catch (err) {
    console.error("[api/db/products PUT]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

// DELETE → soft-delete (deleted_at). Body = { id }.
export async function DELETE(req: Request) {
  if (!hasDb()) return NextResponse.json({ ok: false, source: "mock" });
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ ok: false, source: "mock" });
  try {
    const { id } = (await req.json().catch(() => ({}))) as { id?: string };
    if (!id) return NextResponse.json({ error: "id wajib" }, { status: 400 });
    await withTenant(ctx, (tx) => tx.update(productTable).set({ deletedAt: new Date() }).where(and(eq(productTable.id, id), eq(productTable.tenantId, ctx.tenantId))));
    return NextResponse.json({ ok: true, source: "db" });
  } catch (err) {
    console.error("[api/db/products DELETE]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
