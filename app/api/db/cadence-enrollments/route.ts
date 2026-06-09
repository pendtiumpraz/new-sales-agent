import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { db, hasDb } from "@/lib/db/client";
import { cadenceEnrollmentsTable, cadencesTable } from "@/lib/db/schema";
import type { CadenceEnrollment } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/db/cadence-enrollments?cadenceId=cd_xxx → filtered to that cadence.
// Without the param returns all enrollments. Returns [] when DB is unset/empty
// (no useful seed here — enrollments are user-generated).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cadenceId = url.searchParams.get("cadenceId");

  if (!hasDb()) {
    return NextResponse.json({ data: [], source: "mock" });
  }
  try {
    const rows = cadenceId
      ? await db
          .select()
          .from(cadenceEnrollmentsTable)
          .where(eq(cadenceEnrollmentsTable.cadenceId, cadenceId))
      : await db.select().from(cadenceEnrollmentsTable);
    return NextResponse.json({
      data: rows as unknown as CadenceEnrollment[],
      source: "db",
    });
  } catch (err) {
    console.error("[api/db/cadence-enrollments GET]", err);
    return NextResponse.json({ data: [], source: "mock-fallback" });
  }
}

// POST /api/db/cadence-enrollments → bulk enroll contacts into a cadence.
// Body = { cadenceId: string; contactIds: string[] }. Creates one enrollment
// row per contact (uuid id) and increments the cadence's `enrolled` count.
export async function POST(req: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  try {
    const body = (await req.json()) as {
      cadenceId: string;
      contactIds: string[];
    };
    if (!body?.cadenceId || !Array.isArray(body?.contactIds)) {
      return NextResponse.json(
        { error: "Missing cadenceId or contactIds" },
        { status: 400 },
      );
    }
    if (body.contactIds.length === 0) {
      return NextResponse.json({ ok: true, count: 0, source: "db" });
    }

    const rows = body.contactIds.map((contactId) => ({
      id: crypto.randomUUID(),
      cadenceId: body.cadenceId,
      contactId,
      currentStepIdx: 0,
      status: "aktif",
    }));

    // Insert enrollments. onConflictDoNothing on the random id is effectively
    // a no-op (uuids don't collide); we use it as a safety net.
    await db
      .insert(cadenceEnrollmentsTable)
      .values(rows)
      .onConflictDoNothing();

    // Bump the cadence's `enrolled` counter so the list card reflects the
    // new total immediately on the next GET /api/db/cadences.
    await db
      .update(cadencesTable)
      .set({
        enrolled: sql`${cadencesTable.enrolled} + ${rows.length}`,
        updatedAt: new Date(),
      })
      .where(eq(cadencesTable.id, body.cadenceId));

    return NextResponse.json({
      ok: true,
      count: rows.length,
      source: "db",
    });
  } catch (err) {
    console.error("[api/db/cadence-enrollments POST]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}

// PUT /api/db/cadence-enrollments → update an existing enrollment. Body =
// { id, currentStepIdx?, status?, lastStepAt?, nextStepDueAt? }. Used by the
// (future) autopilot worker to advance steps or mark stop.
export async function PUT(req: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, source: "mock" }, { status: 200 });
  }
  try {
    const body = (await req.json()) as Partial<CadenceEnrollment> & {
      id: string;
    };
    if (!body?.id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    if (typeof body.currentStepIdx === "number")
      patch.currentStepIdx = body.currentStepIdx;
    if (body.status) patch.status = body.status;
    if (body.lastStepAt) patch.lastStepAt = new Date(body.lastStepAt);
    if (body.nextStepDueAt) patch.nextStepDueAt = new Date(body.nextStepDueAt);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true, source: "db", noop: true });
    }

    await db
      .update(cadenceEnrollmentsTable)
      .set(patch)
      .where(eq(cadenceEnrollmentsTable.id, body.id));
    return NextResponse.json({ ok: true, source: "db", id: body.id });
  } catch (err) {
    console.error("[api/db/cadence-enrollments PUT]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
