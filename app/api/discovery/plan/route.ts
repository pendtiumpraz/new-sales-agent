import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { enrichmentService } from "@/modules/enrichment/service";
import type { PlanInput } from "@/modules/enrichment/plan";

export const runtime = "nodejs";

// POST /api/discovery/plan — CROSS-CHANNEL discovery planner. A field/profession +
// Indonesian location → an actionable, CHANNEL-NEUTRAL hunt plan: per-channel
// guidance (linkedin incl. intent-mining post-search, google maps, dorks,
// instagram, facebook, marketplace, tiktok) PLUS channel-agnostic roles /
// industries / candidate companies / keywords. No DB needed — pure metered AI;
// degrades to a heuristic plan on any failure (never "token habis"). The real
// people come from the extension / crawl + /api/discovery/ingest, not this reply.
export async function POST(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as Partial<PlanInput>;
    const plan = await enrichmentService.planDiscoveryChannels(g.ctx, {
      field: body.field ?? "",
      location: body.location ?? "Indonesia",
      seniority: body.seniority ?? null,
    });
    return ok(plan);
  }, "api/discovery/plan POST");
}
