import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getSecret } from "@/lib/config/secrets";
import { hasDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";
import { requirePermission } from "@/lib/rbac/guard";
import { extensionConnectionTable } from "@/lib/db/schema";

export const runtime = "nodejs";

// GET /api/extension/status (doc 40) — session-authed status for Settings →
// Extension: has the extension ever connected, and how recently? `connected`
// (live) = a heartbeat within the last 10 minutes.
const LIVE_MS = 10 * 60 * 1000;

export async function GET() {
  const guard = await requirePermission("tenant.settings.manage");
  if ("error" in guard) return guard.error;
  const ctx = guard.ctx;

  const tokenConfigured = Boolean(await getSecret("LINKEDIN_INGEST_TOKEN"));
  if (!hasDb()) return NextResponse.json({ connected: false, ever: false, tokenConfigured, source: "mock" });

  try {
    const rows = await withTenant(ctx, (tx) =>
      tx.select().from(extensionConnectionTable).where(eq(extensionConnectionTable.tenantId, ctx.tenantId)).limit(1),
    );
    const row = rows[0];
    if (!row) return NextResponse.json({ connected: false, ever: false, tokenConfigured, source: "db" });
    const lastSeen = new Date(row.lastSeenAt as unknown as string);
    const ageMs = Date.now() - lastSeen.getTime();
    return NextResponse.json({
      connected: ageMs <= LIVE_MS,
      ever: true,
      lastSeenAt: lastSeen.toISOString(),
      ageSeconds: Math.floor(ageMs / 1000),
      version: row.version,
      tokenConfigured,
      source: "db",
    });
  } catch (err) {
    console.error("[api/extension/status GET]", err);
    return NextResponse.json({ connected: false, ever: false, tokenConfigured, source: "error" });
  }
}
