import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { getTenantContext } from "@/lib/auth/session-context";
import { personTable } from "@/lib/db/schema";

export const runtime = "nodejs";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// GET /api/profiles/stale (doc 40) — people whose crawl data is null or older
// than 1 year, oldest first, so the UI can prompt a re-crawl (extension Stage 2).
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx || !hasDb()) return NextResponse.json({ data: [], source: "mock" });

  try {
    const persons = await withTenant(ctx, (tx) => tx.select().from(personTable));
    const now = Date.now();

    const data = persons
      .map((p) => {
        const capturedAt = p.capturedAt ? new Date(p.capturedAt as unknown as string) : null;
        const ageDays = capturedAt ? Math.floor((now - capturedAt.getTime()) / 86_400_000) : null;
        const stale = !capturedAt || now - capturedAt.getTime() > YEAR_MS;
        return { id: p.id, fullName: p.fullName, linkedinUrl: p.linkedinUrl, capturedAt, ageDays, stale };
      })
      .filter((p) => p.stale)
      .sort((a, b) => {
        // null capturedAt (never crawled) first, then oldest
        if (a.ageDays === null) return -1;
        if (b.ageDays === null) return 1;
        return b.ageDays - a.ageDays;
      });

    return NextResponse.json({ data, count: data.length, source: "db" });
  } catch (err) {
    console.error("[api/profiles/stale GET]", err);
    return NextResponse.json({ data: [], source: "error" });
  }
}
