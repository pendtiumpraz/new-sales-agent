import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db, hasDb } from "@/lib/db/client";
import { kbTable } from "@/lib/db/schema";
// Mock module exports seedKnowledgeBase as the canonical KB blob; alias it
// as mockKb so this route reads naturally as "fall back to mock".
import { seedKnowledgeBase as mockKb } from "@/lib/api-mock/kb";
import type { KnowledgeBase } from "@/lib/types/kb";

export const runtime = "nodejs";

// Single-tenant demo — one well-known row id per client.
const CLIENT_ID = "client_default";

// GET /api/db/kb → returns the saved KB, falls back to seed if missing or DB unset.
export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ data: mockKb, source: "mock" });
  }
  try {
    const rows = await db
      .select()
      .from(kbTable)
      .where(eq(kbTable.id, CLIENT_ID))
      .limit(1);
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
  try {
    const body = (await req.json()) as { data: KnowledgeBase };
    if (!body?.data) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    await db
      .insert(kbTable)
      .values({ id: CLIENT_ID, data: body.data })
      .onConflictDoUpdate({
        target: kbTable.id,
        set: { data: body.data, updatedAt: new Date() },
      });
    return NextResponse.json({ ok: true, source: "db" });
  } catch (err) {
    console.error("[api/db/kb PUT]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
