import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle, parseJson } from "@/modules/_shared/api";
import { agentTaskService, type SubmitResultInput } from "@/modules/agent-task/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/agent/tasks/[id]/result → the tenant's agent posts back the generation
// result (→ done) or an error (→ failed). Then the service DISPATCHES applyResult
// (finish the autopilot run / classify the contact / …) best-effort. Auth =
// write-scope API key (Bearer msk_…) → data.write. Body { result?, error? }.
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return g.error;
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = await parseJson<SubmitResultInput>(req);
    const task = await agentTaskService.submitResult(g.ctx, params.id, body);
    return ok({ ok: true, id: task.id, status: task.status });
  }, "api/agent/tasks/[id]/result POST");
}
