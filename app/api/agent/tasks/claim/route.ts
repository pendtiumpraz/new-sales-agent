import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, handle } from "@/modules/_shared/api";
import { agentTaskService } from "@/modules/agent-task/service";

export const runtime = "nodejs";

// POST /api/agent/tasks/claim?limit=N → atomically claim up to N (default 5, max
// 50) of the oldest queued BYOA tasks for the tenant and return them. Auth =
// write-scope API key (Bearer msk_…) → data.write. Concurrent pollers get disjoint
// sets (FOR UPDATE SKIP LOCKED), so it's safe to run many agents at once.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return g.error;
  if (!hasDb()) return ok({ tasks: [] });
  return handle(async () => {
    const raw = new URL(req.url).searchParams.get("limit");
    const limit = raw ? Number.parseInt(raw, 10) : undefined;
    const tasks = await agentTaskService.claim(g.ctx, limit ?? 5);
    return ok({ tasks });
  }, "api/agent/tasks/claim POST");
}
