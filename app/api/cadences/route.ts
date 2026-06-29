import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService, type CreateCadenceInput } from "@/modules/outreach/service";

export const runtime = "nodejs";

// GET /api/cadences → list the tenant's live cadences. ?workspaceId= / ?status= filters. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const filter = {
    workspaceId: sp.get("workspaceId") ?? undefined,
    status: sp.get("status") ?? undefined,
  };
  return handle(async () => ok(await outreachService.listCadences(g.ctx, filter)), "api/cadences GET");
}

// POST /api/cadences → create a cadence (named follow-up sequence). data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateCadenceInput;
    return ok(await outreachService.createCadence(g.ctx, body), { status: 201 });
  }, "api/cadences POST");
}
