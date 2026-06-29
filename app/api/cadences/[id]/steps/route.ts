import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService, type CreateStepInput } from "@/modules/outreach/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/cadences/[id]/steps → ordered steps of the cadence. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await outreachService.listSteps(g.ctx, params.id)),
    "api/cadences/[id]/steps GET",
  );
}

// POST /api/cadences/[id]/steps → append a step (channel wa/email/call + delay +
// template). data.write.
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as Omit<CreateStepInput, "cadenceId">;
    return ok(
      await outreachService.createStep(g.ctx, { ...body, cadenceId: params.id }),
      { status: 201 },
    );
  }, "api/cadences/[id]/steps POST");
}
