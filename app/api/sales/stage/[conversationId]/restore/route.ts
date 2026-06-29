import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { salesService } from "@/modules/sales/service";

export const runtime = "nodejs";

interface Ctx {
  params: { conversationId: string };
}

// PATCH /api/sales/stage/[conversationId]/restore → clear deleted_at (un-trash).
// data.write.
export async function PATCH(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await salesService.restoreStage(g.ctx, params.conversationId)),
    "api/sales/stage/[conversationId]/restore PATCH",
  );
}
