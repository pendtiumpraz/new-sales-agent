import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService, type CreateHandoffInput } from "@/modules/outreach/service";

export const runtime = "nodejs";

// GET /api/handoff → list handoff queue items. ?conversationId= / ?status= /
// ?assignedUserId= filters. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const filter = {
    conversationId: sp.get("conversationId") ?? undefined,
    status: sp.get("status") ?? undefined,
    assignedUserId: sp.get("assignedUserId") ?? undefined,
  };
  return handle(async () => ok(await outreachService.listHandoffs(g.ctx, filter)), "api/handoff GET");
}

// POST /api/handoff → queue a handoff for human takeover of a conversation. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateHandoffInput;
    return ok(await outreachService.createHandoff(g.ctx, body), { status: 201 });
  }, "api/handoff POST");
}
