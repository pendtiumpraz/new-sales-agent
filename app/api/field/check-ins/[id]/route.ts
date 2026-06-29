import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { fieldService, type UpdateCheckInInput } from "@/modules/field/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/field/check-ins/[id] → one check-in lapangan. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await fieldService.getCheckIn(g.ctx, params.id)), "api/field/check-ins/[id] GET");
}

// PATCH /api/field/check-ins/[id] → update a check-in lapangan. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateCheckInInput;
    return ok(await fieldService.updateCheckIn(g.ctx, params.id, body));
  }, "api/field/check-ins/[id] PATCH");
}

// DELETE /api/field/check-ins/[id]          → SOFT delete (sets deleted_at).
// DELETE /api/field/check-ins/[id]?purge=1  → HARD delete (permanent removal). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await fieldService.hardDeleteCheckIn(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await fieldService.softDeleteCheckIn(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/field/check-ins/[id] DELETE");
}
