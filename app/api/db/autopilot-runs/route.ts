import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";

import { db, hasDb } from "@/lib/db/client";
import { autopilotRunsTable } from "@/lib/db/schema";
import type { AutopilotRun } from "@/lib/types/autopilot";

export const runtime = "nodejs";

// GET /api/db/autopilot-runs → last 50 runs, newest first.
// Returns an empty list when the DB is not configured so the client can
// degrade gracefully (mock-only mode).
export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ data: [], source: "mock" });
  }
  try {
    const rows = await db
      .select()
      .from(autopilotRunsTable)
      .orderBy(desc(autopilotRunsTable.createdAt))
      .limit(50);
    return NextResponse.json({ data: rows, source: "db" });
  } catch (err) {
    console.error("[api/db/autopilot-runs GET]", err);
    return NextResponse.json({ data: [], source: "mock-fallback" });
  }
}

// PUT /api/db/autopilot-runs → upsert one run.
// Body = { data: AutopilotRun }. Intended to be fired when the run hits a
// terminal status (done / stopped / failed) so we don't write every event.
export async function PUT(req: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, source: "mock" });
  }
  try {
    const body = (await req.json()) as { data: AutopilotRun };
    const r = body?.data;
    if (!r?.id) {
      return NextResponse.json({ error: "Missing data.id" }, { status: 400 });
    }
    await db
      .insert(autopilotRunsTable)
      .values({
        id: r.id,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt ?? null,
        status: r.status,
        config: r.config,
        events: r.events,
        metrics: r.metrics,
      })
      .onConflictDoUpdate({
        target: autopilotRunsTable.id,
        set: {
          finishedAt: r.finishedAt ?? null,
          status: r.status,
          events: r.events,
          metrics: r.metrics,
        },
      });
    return NextResponse.json({ ok: true, source: "db" });
  } catch (err) {
    console.error("[api/db/autopilot-runs PUT]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
