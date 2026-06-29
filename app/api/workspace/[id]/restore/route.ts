import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { workspaceService } from "@/modules/workspace/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// PATCH /api/workspace/[id]/restore → clear deleted_at (un-trash, cascades to
// satellites). data.write.
export async function PATCH(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await workspaceService.restore(g.ctx, params.id)),
    "api/workspace/[id]/restore PATCH",
  );
}
