import { NextResponse } from "next/server";

import { getSecret } from "@/lib/config/secrets";
import { hasDb } from "@/lib/db/client";
import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { extensionConnectionTable } from "@/lib/db/schema";
import { touchRepHeartbeat } from "@/lib/team/rep-account";
import { listWorkspaces } from "@/lib/workspace/store";
import { tenantService } from "@/modules/tenant/service";

export const runtime = "nodejs";

// POST /api/extension/heartbeat (doc 40/41) — the browser extension/userscript
// pings here with its ingest token to prove it's installed AND authorized.
// Doubles as the "Test koneksi" button target. A PER-REP token updates that
// rep's last_seen_at; the tenant token updates the tenant-level connection.
export async function POST(req: Request) {
  const token = req.headers.get("x-ingest-token") ?? "";
  const body = (await req.json().catch(() => ({}))) as { version?: string };
  const version = body.version ?? null;
  // The platform is the source of the AI key — the extension pulls it on connect
  // so the rep never pastes it manually (doc 40). Returned only on a valid token.
  const deepseekKey = (await getSecret("DEEPSEEK_API_KEY")) ?? "";

  // Per-rep token → record the rep's heartbeat (drives monitoring "Aktif").
  if (token && hasDb()) {
    const rep = await touchRepHeartbeat(token, version);
    if (rep) {
      // Send the rep's workspaces so the popup can offer a "crawl untuk workspace"
      // picker (doc 44). The chosen id is tagged onto every ingested lead.
      const repCtx = { tenantId: rep.tenantId, userId: rep.userId, role: "member" as const };
      let workspaces: { id: string; name: string; type: string }[] = [];
      try {
        const ws = await listWorkspaces(repCtx);
        workspaces = ws.filter((w) => w.status !== "archived").map((w) => ({ id: w.id, name: w.name, type: w.type }));
      } catch (err) {
        console.error("[heartbeat workspaces]", err);
      }
      // Send the tenant's live quota (used/limit per metric) + plan so the extension
      // shows the same numbers the platform enforces — the per-rep token is the sync key.
      let quota: Awaited<ReturnType<typeof tenantService.quotaSummary>> = [];
      let plan: string | null = null;
      try {
        plan = (await tenantService.get(rep.tenantId)).planKey ?? null;
        quota = await tenantService.quotaSummary(repCtx);
      } catch (err) {
        console.error("[heartbeat quota]", err);
      }
      return NextResponse.json({ ok: true, connected: true, tenant: rep.tenantId, scope: "rep", deepseekKey, workspaces, quota, plan, source: "db" });
    }
  }

  // Otherwise fall back to the tenant-level token.
  const ingestToken = await getSecret("LINKEDIN_INGEST_TOKEN");
  if (!token || !ingestToken || token !== ingestToken) {
    return NextResponse.json({ ok: false, connected: false, error: "Token tidak valid" }, { status: 401 });
  }
  const ctx: TenantContext = {
    tenantId: (await getSecret("LINKEDIN_INGEST_TENANT")) || "t_default",
    userId: "extension",
    role: "member",
  };
  const userAgent = req.headers.get("user-agent") ?? null;

  if (!hasDb()) {
    // Token is valid even without a DB — report connected so the popup confirms.
    return NextResponse.json({ ok: true, connected: true, tenant: ctx.tenantId, deepseekKey, source: "mock" });
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
    return NextResponse.json({ ok: true, connected: true, tenant: ctx.tenantId, serverTime: now.toISOString(), deepseekKey, source: "db" });
  } catch (err) {
    console.error("[api/extension/heartbeat POST]", err);
    return NextResponse.json({ ok: false, connected: false, error: "Internal error" }, { status: 500 });
  }
}
