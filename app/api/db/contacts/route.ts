import { NextResponse } from "next/server";

import { db, hasDb } from "@/lib/db/client";
import { contactsTable } from "@/lib/db/schema";
import { contacts as seedContacts } from "@/lib/api-mock/data";
import type { Contact } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/db/contacts → returns saved contacts, falls back to seed when DB is
// unconfigured, empty, or errors. Same pattern as the kb route + the deals
// route Agent C is building in parallel.
export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ data: seedContacts, source: "mock" });
  }
  try {
    const rows = await db.select().from(contactsTable);
    if (!rows.length) {
      return NextResponse.json({ data: seedContacts, source: "seed" });
    }
    return NextResponse.json({ data: rows as unknown as Contact[], source: "db" });
  } catch (err) {
    console.error("[api/db/contacts GET]", err);
    return NextResponse.json({ data: seedContacts, source: "mock-fallback" });
  }
}

// PUT /api/db/contacts → upsert each contact by id. Body = { data: Contact[] }.
export async function PUT(req: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  try {
    const body = (await req.json()) as { data: Contact[] };
    if (!body?.data || !Array.isArray(body.data)) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    for (const c of body.data) {
      await db
        .insert(contactsTable)
        .values({ ...c, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: contactsTable.id,
          set: { ...c, updatedAt: new Date() },
        });
    }
    return NextResponse.json({ ok: true, source: "db", count: body.data.length });
  } catch (err) {
    console.error("[api/db/contacts PUT]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
