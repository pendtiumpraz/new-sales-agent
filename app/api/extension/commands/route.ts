import { NextResponse } from "next/server";

import { hasDb } from "@/lib/db/client";
import type { TenantContext } from "@/lib/db/tenant-context";
import { resolveRepByToken } from "@/lib/team/rep-account";
import { extCommandService } from "@/modules/ext-command/service";

export const runtime = "nodejs";

// GET /api/extension/commands — the browser extension POLLS + CLAIMS platform-driven
// commands (Fase 3 DRIVE). Auth = the PER-REP INGEST TOKEN (`x-ingest-token` →
// resolveRepByToken, same as /api/extension/heartbeat + /api/ingest — NOT the agent
// API key). Atomically claims up to N (default 5, max 25) of the oldest queued
// commands for the rep's tenant that this rep may run (target_user_id NULL or = rep).
// The extension dispatches each (crawl→scraper, enrich→deep-enrich, stop→halt) and
// reports back via POST /api/extension/commands/[id]/result. Response mirrors the
// extension's other endpoints ({ ok, commands }) — NOT the {ok,data} agent envelope.
export async function GET(req: Request) {
  const token = req.headers.get("x-ingest-token") ?? "";
  if (!token) return NextResponse.json({ ok: false, error: "Token tidak valid" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, commands: [], source: "mock" });

  const rep = await resolveRepByToken(token);
  if (!rep) return NextResponse.json({ ok: false, error: "Token tidak valid" }, { status: 401 });

  const ctx: TenantContext = { tenantId: rep.tenantId, userId: rep.userId, role: "member" };
  const raw = new URL(req.url).searchParams.get("limit");
  const limit = raw ? Number.parseInt(raw, 10) : undefined;
  try {
    const commands = await extCommandService.claimForUser(ctx, rep.userId, limit ?? 5);
    return NextResponse.json({ ok: true, commands, source: "db" });
  } catch (err) {
    console.error("[api/extension/commands GET]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
