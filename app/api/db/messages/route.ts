import { NextResponse } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { messagesTable } from "@/lib/db/schema";
import { messages as seedMessages } from "@/lib/api-mock/data";
import type { Message } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/db/messages?conversationId=cv_0001 → returns messages for that
// conversation. Without the param, returns all messages (use sparingly).
// Falls back to seed when DB is unconfigured, empty, or errors.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");

  const filterSeed = (rows: Message[]) =>
    conversationId
      ? rows.filter((m) => m.conversationId === conversationId)
      : rows;

  if (!hasDb()) {
    return NextResponse.json({
      data: filterSeed(seedMessages),
      source: "mock",
    });
  }
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({
      data: filterSeed(seedMessages),
      source: "mock",
    });
  }
  try {
    // RLS is off — scope to this tenant explicitly (keep legacy null-tenant seed rows).
    const tPred = or(eq(messagesTable.tenantId, ctx.tenantId), isNull(messagesTable.tenantId));
    const rows = await withTenant(ctx, (tx) =>
      conversationId
        ? tx
            .select()
            .from(messagesTable)
            .where(and(tPred, eq(messagesTable.conversationId, conversationId)))
        : tx.select().from(messagesTable).where(tPred),
    );
    if (!rows.length) {
      return NextResponse.json({
        data: filterSeed(seedMessages),
        source: "seed",
      });
    }
    return NextResponse.json({
      data: rows as unknown as Message[],
      source: "db",
    });
  } catch (err) {
    console.error("[api/db/messages GET]", err);
    return NextResponse.json({
      data: filterSeed(seedMessages),
      source: "mock-fallback",
    });
  }
}

// PUT /api/db/messages → insert each message. Messages are immutable, so on id
// conflict we simply skip (no update). Body = { data: Message[] }.
export async function PUT(req: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  try {
    const body = (await req.json()) as { data: Message[] };
    if (!body?.data || !Array.isArray(body.data)) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    await withTenant(ctx, async (tx) => {
      for (const m of body.data) {
        await tx
          .insert(messagesTable)
          .values({ ...m, tenantId: ctx.tenantId })
          .onConflictDoNothing();
      }
    });
    return NextResponse.json({
      ok: true,
      source: "db",
      count: body.data.length,
    });
  } catch (err) {
    console.error("[api/db/messages PUT]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
