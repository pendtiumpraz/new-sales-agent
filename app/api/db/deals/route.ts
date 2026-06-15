import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { dealsTable } from "@/lib/db/schema";
// Mock module exports the canonical seed deals; alias as seedDeals so this
// route reads naturally as "fall back to seed".
import { deals as seedDeals } from "@/lib/api-mock/data";

export const runtime = "nodejs";

// GET /api/db/deals → returns all deals. Falls back to seed if DB unset or empty.
export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ data: seedDeals, source: "mock" });
  }
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ data: seedDeals, source: "mock" });
  }
  try {
    const rows = await withTenant(ctx, (tx) => tx.select().from(dealsTable));
    if (rows.length === 0) {
      return NextResponse.json({ data: seedDeals, source: "seed" });
    }
    return NextResponse.json({ data: rows, source: "db" });
  } catch (err) {
    console.error("[api/db/deals GET]", err);
    return NextResponse.json({ data: seedDeals, source: "mock-fallback" });
  }
}

// PUT /api/db/deals → upsert each deal in the payload. Body = { data: Deal[] }.
// Full-snapshot model matches the Zustand store's full-state-export pattern;
// future versions can switch to per-row PATCH.
export async function PUT(req: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  try {
    const body = (await req.json()) as { data: any[] };
    if (!Array.isArray(body?.data)) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    // Upsert each — preserves history for rows not in the payload.
    await withTenant(ctx, async (tx) => {
      for (const d of body.data) {
        await tx
          .insert(dealsTable)
          .values({
            id: d.id,
            name: d.name,
            contactId: d.contactId,
            contactName: d.contactName,
            company: d.company,
            value: d.value,
            stage: d.stage,
            expectedClose: d.expectedClose,
            sourceChannel: d.sourceChannel,
            owner: d.owner,
            avatarColor: d.avatarColor,
            createdAt: d.createdAt,
            tenantId: ctx.tenantId,
          })
          .onConflictDoUpdate({
            target: dealsTable.id,
            set: {
              stage: d.stage,
              value: d.value,
              expectedClose: d.expectedClose,
              updatedAt: new Date(),
              tenantId: ctx.tenantId,
            },
          });
      }
    });
    return NextResponse.json({ ok: true, source: "db" });
  } catch (err) {
    console.error("[api/db/deals PUT]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
