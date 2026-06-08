import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db, hasDb } from "@/lib/db/client";
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
  try {
    const rows = conversationId
      ? await db
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, conversationId))
      : await db.select().from(messagesTable);
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
  try {
    const body = (await req.json()) as { data: Message[] };
    if (!body?.data || !Array.isArray(body.data)) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    for (const m of body.data) {
      await db.insert(messagesTable).values(m).onConflictDoNothing();
    }
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
