import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { kbTable } from "@/lib/db/schema";
// Mock module exports seedKnowledgeBase as the canonical KB blob; alias it
// as mockKb so this route reads naturally as "fall back to mock".
import { seedKnowledgeBase as mockKb } from "@/lib/api-mock/kb";
import type { KnowledgeBase } from "@/lib/types/kb";

export const runtime = "nodejs";

// kb is one row per tenant

// GET /api/db/kb → returns the saved KB, falls back to seed if missing or DB unset.
export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ data: mockKb, source: "mock" });
  }
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ data: mockKb, source: "mock" });
  }
  const kbId = "kb_" + ctx.tenantId;
  try {
    const rows = await withTenant(ctx, (tx) =>
      tx
        .select()
        .from(kbTable)
        .where(eq(kbTable.id, kbId))
        .limit(1),
    );
    if (!rows[0]) return NextResponse.json({ data: mockKb, source: "seed" });
    return NextResponse.json({ data: rows[0].data, source: "db" });
  } catch (err) {
    console.error("[api/db/kb GET]", err);
    return NextResponse.json({ data: mockKb, source: "mock-fallback" });
  }
}

// PUT /api/db/kb → upsert the whole KB blob. Body = { data: KnowledgeBase }.
export async function PUT(req: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  const kbId = "kb_" + ctx.tenantId;
  try {
    const body = (await req.json()) as { data: KnowledgeBase };
    if (!body?.data) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    await withTenant(ctx, async (tx) => {
      await tx
        .insert(kbTable)
        .values({ id: kbId, tenantId: ctx.tenantId, data: body.data })
        .onConflictDoUpdate({
          target: kbTable.id,
          set: { data: body.data, tenantId: ctx.tenantId, updatedAt: new Date() },
        });
    });
    return NextResponse.json({ ok: true, source: "db" });
  } catch (err) {
    console.error("[api/db/kb PUT]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
