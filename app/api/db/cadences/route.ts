import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { cadencesTable } from "@/lib/db/schema";
import { cadences as seedCadences } from "@/lib/api-mock/data";
import type { Cadence } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/db/cadences → returns all cadences. Falls back to seed when DB is
// unconfigured, empty, or errors. Same pattern as `/api/db/kb` + the deals,
// contacts, conversations, messages routes.
export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ data: seedCadences, source: "mock" });
  }
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ data: seedCadences, source: "mock" });
  }
  try {
    const rows = await withTenant(ctx, (tx) => tx.select().from(cadencesTable));
    if (!rows.length) {
      return NextResponse.json({ data: seedCadences, source: "seed" });
    }
    return NextResponse.json({
      data: rows as unknown as Cadence[],
      source: "db",
    });
  } catch (err) {
    console.error("[api/db/cadences GET]", err);
    return NextResponse.json({ data: seedCadences, source: "mock-fallback" });
  }
}

// PUT /api/db/cadences → upsert a single cadence. Body = { data: Cadence }.
// The builder posts the whole cadence object after each save; on conflict we
// refresh every editable column so toggling a draft to active works in-place.
export async function PUT(req: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  try {
    const body = (await req.json()) as { data: Cadence };
    if (!body?.data?.id) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    const c = body.data;
    await withTenant(ctx, async (tx) => {
      await tx
        .insert(cadencesTable)
        .values({
          id: c.id,
          name: c.name,
          status: c.status,
          steps: c.steps,
          channelMix: c.channelMix,
          enrolled: c.enrolled ?? 0,
          replyRate: c.replyRate ?? 0,
          owner: c.owner ?? null,
          createdAt: c.createdAt ?? new Date().toISOString(),
          tenantId: ctx.tenantId,
        })
        .onConflictDoUpdate({
          target: cadencesTable.id,
          set: {
            name: c.name,
            status: c.status,
            steps: c.steps,
            channelMix: c.channelMix,
            enrolled: c.enrolled ?? 0,
            replyRate: c.replyRate ?? 0,
            owner: c.owner ?? null,
            updatedAt: new Date(),
            tenantId: ctx.tenantId,
          },
        });
    });
    return NextResponse.json({ ok: true, source: "db", id: c.id });
  } catch (err) {
    console.error("[api/db/cadences PUT]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}

// POST is an alias for PUT so callers using either verb succeed. Some
// clients (axios defaults, demo cURL examples) reach for POST when
// upserting; we don't want a 405 from a method mismatch.
export const POST = PUT;
