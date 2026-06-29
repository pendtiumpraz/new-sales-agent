import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { salesService, type EvaluateReadinessInput } from "@/modules/sales/service";

export const runtime = "nodejs";

/**
 * Rebuild (Module 6) closing-readiness collection route. Supersedes the legacy
 * prototype GET (which returned an ad-hoc `{readiness}` shape over the file-based
 * `predictive-store`) with the standard `{ok,data}` envelope over the new
 * `closing_readiness` table. The legacy in-app readiness UI computes its score
 * client-side and the WA orchestrator writes the store directly, so neither
 * depends on this HTTP response — the cutover is clean.
 */

// GET /api/sales/readiness                       → list live readiness rows (hottest first).
// GET /api/sales/readiness?conversationId=cnv_…  → one conversation's readiness (or null).
// GET /api/sales/readiness?band=hot              → filter by band (cold|warm|hot).
// GET /api/sales/readiness?trashed=1             → soft-deleted readiness rows. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  const band = url.searchParams.get("band") ?? undefined;
  const trashed = url.searchParams.get("trashed");
  return handle<unknown>(async () => {
    if (conversationId) return ok(await salesService.getReadiness(g.ctx, conversationId));
    if (trashed === "1" || trashed === "true")
      return ok(await salesService.listTrashedReadiness(g.ctx));
    return ok(await salesService.listReadiness(g.ctx, { band }));
  }, "api/sales/readiness GET");
}

// POST /api/sales/readiness → evaluate (run the 0..100 scorer) + persist. Pure
// heuristic — no AI. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as EvaluateReadinessInput;
    const row = await salesService.evaluateReadiness(g.ctx, body);
    return ok(row, { status: 201 });
  }, "api/sales/readiness POST");
}
