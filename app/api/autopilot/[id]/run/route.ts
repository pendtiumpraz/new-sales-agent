import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService } from "@/modules/outreach/service";

export const runtime = "nodejs";
// The advance drives one AI orchestrator turn (buildWaReply) synchronously, so
// give it room beyond the default before the platform times the function out.
export const maxDuration = 30;

interface Ctx {
  params: { id: string };
}

// POST /api/autopilot/[id]/run → drive a queued/error run to completion
// server-side: flip to running, reuse the WA closing-flow orchestrator over the
// linked conversation, append the log, then finish (done|escalated|error).
// data.write.
export async function POST(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await outreachService.advanceRun(g.ctx, params.id)),
    "api/autopilot/[id]/run POST",
  );
}
