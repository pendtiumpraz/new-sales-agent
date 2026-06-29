import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { retentionService, type UpdateFlowInput } from "@/modules/retention/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/retention/flows/[id] → one flow retensi. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await retentionService.getFlow(g.ctx, params.id)), "api/retention/flows/[id] GET");
}

// PATCH /api/retention/flows/[id] → update a flow retensi. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateFlowInput;
    return ok(await retentionService.updateFlow(g.ctx, params.id, body));
  }, "api/retention/flows/[id] PATCH");
}

// DELETE /api/retention/flows/[id]          → SOFT delete (sets deleted_at).
// DELETE /api/retention/flows/[id]?purge=1  → HARD delete (permanent removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await retentionService.hardDeleteFlow(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await retentionService.softDeleteFlow(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/retention/flows/[id] DELETE");
}
