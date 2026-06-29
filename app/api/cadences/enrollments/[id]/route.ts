import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService } from "@/modules/outreach/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/cadences/enrollments/[id] → one enrollment. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await outreachService.getEnrollment(g.ctx, params.id)),
    "api/cadences/enrollments/[id] GET",
  );
}

// PATCH /api/cadences/enrollments/[id] → transition status (active|paused|
// completed|stopped). Body: { status, stopReason? }. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as { status?: string; stopReason?: string | null };
    if (!body.status) return fail("status wajib diisi", 400, "validation");
    return ok(
      await outreachService.setEnrollmentStatus(g.ctx, params.id, body.status, body.stopReason),
    );
  }, "api/cadences/enrollments/[id] PATCH");
}

// DELETE /api/cadences/enrollments/[id]         → SOFT delete.
// DELETE /api/cadences/enrollments/[id]?purge=1 → HARD delete. data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await outreachService.hardDeleteEnrollment(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await outreachService.softDeleteEnrollment(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/cadences/enrollments/[id] DELETE");
}
