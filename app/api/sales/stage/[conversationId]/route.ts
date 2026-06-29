import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { salesService } from "@/modules/sales/service";

export const runtime = "nodejs";

interface Ctx {
  params: { conversationId: string };
}

// GET /api/sales/stage/[conversationId] → the conversation's stage row (or null).
// data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok(null);
  return handle(
    async () => ok(await salesService.getStage(g.ctx, params.conversationId)),
    "api/sales/stage/[conversationId] GET",
  );
}

// DELETE /api/sales/stage/[conversationId]         → SOFT delete (sets deleted_at).
// DELETE /api/sales/stage/[conversationId]?purge=1 → HARD delete (permanent). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await salesService.hardDeleteStage(g.ctx, params.conversationId);
      return ok({ conversationId: params.conversationId, deleted: true, purged: true });
    }
    await salesService.softDeleteStage(g.ctx, params.conversationId);
    return ok({ conversationId: params.conversationId, deleted: true, purged: false });
  }, "api/sales/stage/[conversationId] DELETE");
}
