import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, handle, parseJson } from "@/modules/_shared/api";
import { extCommandService, type EnqueueCommandInput } from "@/modules/ext-command/service";

export const runtime = "nodejs";

// POST /api/agent/extension/commands — an authorized agent DRIVES the tenant's
// browser extension: enqueue a { type: "crawl"|"enrich"|"stop", params } command.
// Auth = write-scope API key (Bearer msk_…) → data.write (Fase 1). The command is
// enqueued for the CALLER'S tenant; the tenant's extension (per-rep ingest token)
// polls GET /api/extension/commands, runs the RPA, and reports back. Optional
// `targetUserId` addresses one specific rep's browser (null = any rep in tenant).
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return g.error;
  if (!hasDb()) return ok({ command: null });
  return handle(async () => {
    const body = await parseJson<EnqueueCommandInput>(req);
    const command = await extCommandService.enqueue(g.ctx, {
      type: body.type,
      params: body.params,
      targetUserId: body.targetUserId ?? null,
    });
    return ok({ command });
  }, "api/agent/extension/commands POST");
}

// GET /api/agent/extension/commands?status=… — recent commands for the tenant
// (debug/admin for the driving agent). Auth = write-scope API key → data.write.
export async function GET(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return g.error;
  if (!hasDb()) return ok([]);
  return handle(async () => {
    const status = new URL(req.url).searchParams.get("status") ?? undefined;
    return ok(await extCommandService.list(g.ctx, status ? { status } : undefined));
  }, "api/agent/extension/commands GET");
}
