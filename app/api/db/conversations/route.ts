import { NextResponse } from "next/server";
import { eq, isNull, or } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { conversationsTable } from "@/lib/db/schema";
import { conversations as seedConversations } from "@/lib/api-mock/data";
import type { Conversation } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/db/conversations → returns saved conversations, falls back to seed
// when DB is unconfigured, empty, or errors.
export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ data: seedConversations, source: "mock" });
  }
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ data: seedConversations, source: "mock" });
  }
  try {
    const rows = await withTenant(ctx, (tx) =>
      // RLS is off — scope to this tenant explicitly (keep legacy null-tenant seed rows).
      tx.select().from(conversationsTable).where(or(eq(conversationsTable.tenantId, ctx.tenantId), isNull(conversationsTable.tenantId))),
    );
    if (!rows.length) {
      return NextResponse.json({ data: seedConversations, source: "seed" });
    }
    return NextResponse.json({
      data: rows as unknown as Conversation[],
      source: "db",
    });
  } catch (err) {
    console.error("[api/db/conversations GET]", err);
    return NextResponse.json({ data: seedConversations, source: "mock-fallback" });
  }
}

// PUT /api/db/conversations → upsert each conversation by id.
// Body = { data: Conversation[] }.
export async function PUT(req: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  try {
    const body = (await req.json()) as { data: Conversation[] };
    if (!body?.data || !Array.isArray(body.data)) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    await withTenant(ctx, async (tx) => {
      for (const c of body.data) {
        await tx
          .insert(conversationsTable)
          .values({ ...c, tenantId: ctx.tenantId, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: conversationsTable.id,
            set: { ...c, tenantId: ctx.tenantId, updatedAt: new Date() },
          });
      }
    });
    return NextResponse.json({ ok: true, source: "db", count: body.data.length });
  } catch (err) {
    console.error("[api/db/conversations PUT]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
