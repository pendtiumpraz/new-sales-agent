import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { salesService } from "@/modules/sales/service";

export const runtime = "nodejs";

// GET /api/sales/techniques/recommend?conversationId=cnv_…&max=3
//   → the closing techniques to reach for NOW: ranked by the conversation's
//     detected trigger signal + the workspace's market type (B2B stays
//     consultative). HEURISTIC — no AI. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok({ market: "mix", stage: null, techniques: [] });
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  if (!conversationId) return fail("conversationId wajib diisi", 400, "validation");
  const maxRaw = Number(url.searchParams.get("max"));
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.min(maxRaw, 17) : undefined;
  return handle(
    async () => ok(await salesService.recommendForConversation(g.ctx, conversationId, { max })),
    "api/sales/techniques/recommend GET",
  );
}
