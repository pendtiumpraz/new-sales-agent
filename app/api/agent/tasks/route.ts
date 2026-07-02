import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, handle } from "@/modules/_shared/api";
import { agentTaskService } from "@/modules/agent-task/service";

export const runtime = "nodejs";

// GET /api/agent/tasks?status=queued|claimed|done|failed → recent BYOA tasks for
// the tenant (debug/admin). Auth = write-scope API key (Bearer msk_…) → data.write.
export async function GET(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return g.error;
  if (!hasDb()) return ok([]);
  return handle(async () => {
    const status = new URL(req.url).searchParams.get("status") ?? undefined;
    return ok(await agentTaskService.list(g.ctx, status ? { status } : undefined));
  }, "api/agent/tasks GET");
}
