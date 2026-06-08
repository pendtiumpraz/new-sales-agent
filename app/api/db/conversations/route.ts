import { NextResponse } from "next/server";

import { db, hasDb } from "@/lib/db/client";
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
  try {
    const rows = await db.select().from(conversationsTable);
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
  try {
    const body = (await req.json()) as { data: Conversation[] };
    if (!body?.data || !Array.isArray(body.data)) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    for (const c of body.data) {
      await db
        .insert(conversationsTable)
        .values({ ...c, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: conversationsTable.id,
          set: { ...c, updatedAt: new Date() },
        });
    }
    return NextResponse.json({ ok: true, source: "db", count: body.data.length });
  } catch (err) {
    console.error("[api/db/conversations PUT]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
