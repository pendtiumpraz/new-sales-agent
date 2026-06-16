import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { extensionConnectionTable } from "@/lib/db/schema";

export const runtime = "nodejs";

// POST /api/extension/heartbeat (doc 40) — the browser extension/userscript
// pings here with its ingest token to prove it's installed AND authorized.
// Doubles as the "Test koneksi" button target. Upserts last_seen_at so Settings
// → Extension can show "Terhubung". Token-authed (no session).
export async function POST(req: Request) {
  const token = req.headers.get("x-ingest-token");
  if (!token || !process.env.LINKEDIN_INGEST_TOKEN || token !== process.env.LINKEDIN_INGEST_TOKEN) {
    return NextResponse.json({ ok: false, connected: false, error: "Token tidak valid" }, { status: 401 });
  }
  const ctx: TenantContext = {
    tenantId: process.env.LINKEDIN_INGEST_TENANT || "t_default",
    userId: "extension",
    role: "member",
  };
  const body = (await req.json().catch(() => ({}))) as { version?: string };
  const version = body.version ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  if (!hasDb()) {
    // Token is valid even without a DB — report connected so the popup confirms.
    return NextResponse.json({ ok: true, connected: true, tenant: ctx.tenantId, source: "mock" });
  }

  try {
    const now = new Date();
    await withTenant(ctx, (tx) =>
      tx
        .insert(extensionConnectionTable)
        .values({ tenantId: ctx.tenantId, version, userAgent, installedAt: now, lastSeenAt: now })
        .onConflictDoUpdate({
          target: extensionConnectionTable.tenantId,
          set: { version, userAgent, lastSeenAt: now },
        }),
    );
    return NextResponse.json({ ok: true, connected: true, tenant: ctx.tenantId, serverTime: now.toISOString(), source: "db" });
  } catch (err) {
    console.error("[api/extension/heartbeat POST]", err);
    return NextResponse.json({ ok: false, connected: false, error: String(err) }, { status: 500 });
  }
}
