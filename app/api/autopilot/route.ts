import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService, type CreateRunInput } from "@/modules/outreach/service";

export const runtime = "nodejs";

// GET /api/autopilot → list autopilot runs. ?conversationId= / ?contactId= /
// ?status= / ?mode= filters. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const filter = {
    conversationId: sp.get("conversationId") ?? undefined,
    contactId: sp.get("contactId") ?? undefined,
    status: sp.get("status") ?? undefined,
    mode: sp.get("mode") ?? undefined,
  };
  return handle(async () => ok(await outreachService.listRuns(g.ctx, filter)), "api/autopilot GET");
}

// POST /api/autopilot → start an autopilot run (AI auto-orchestration record). data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateRunInput;
    return ok(await outreachService.createRun(g.ctx, body), { status: 201 });
  }, "api/autopilot POST");
}
