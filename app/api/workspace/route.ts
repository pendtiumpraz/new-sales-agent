import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { workspaceService, type CreateWorkspaceInput } from "@/modules/workspace/service";

export const runtime = "nodejs";

// GET /api/workspace → list the tenant's live workspaces. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await workspaceService.list(g.ctx)), "api/workspace GET");
}

// POST /api/workspace → create a workspace (1 ws = 1 product). data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateWorkspaceInput;
    const row = await workspaceService.create(g.ctx, body);
    return ok(row, { status: 201 });
  }, "api/workspace POST");
}
