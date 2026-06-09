import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db, hasDb } from "@/lib/db/client";
import { cadencesTable } from "@/lib/db/schema";
import { cadences as seedCadences } from "@/lib/api-mock/data";
import type { Cadence } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/db/cadences/:id → returns a single cadence, including the steps
// array. Falls back to the seed when DB is unconfigured or the row is missing.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const id = params.id;
  const seedHit = seedCadences.find((c) => c.id === id) ?? null;

  if (!hasDb()) {
    return NextResponse.json({ data: seedHit, source: "mock" });
  }
  try {
    const rows = await db
      .select()
      .from(cadencesTable)
      .where(eq(cadencesTable.id, id))
      .limit(1);
    if (!rows[0]) {
      return NextResponse.json({ data: seedHit, source: "seed" });
    }
    return NextResponse.json({
      data: rows[0] as unknown as Cadence,
      source: "db",
    });
  } catch (err) {
    console.error("[api/db/cadences/[id] GET]", err);
    return NextResponse.json({ data: seedHit, source: "mock-fallback" });
  }
}

// DELETE /api/db/cadences/:id → remove the cadence row. Enrollments are kept
// for audit (they reference the cadence by id but have no FK constraint).
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  try {
    await db.delete(cadencesTable).where(eq(cadencesTable.id, params.id));
    return NextResponse.json({ ok: true, source: "db", id: params.id });
  } catch (err) {
    console.error("[api/db/cadences/[id] DELETE]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
