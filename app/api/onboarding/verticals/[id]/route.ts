import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { onboardingService } from "@/modules/onboarding/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/onboarding/verticals/[id] → one vertical. tenant.settings.manage.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await onboardingService.getVertical(params.id)),
    "api/onboarding/verticals/[id] GET",
  );
}

// DELETE /api/onboarding/verticals/[id]         → SOFT delete (sets deleted_at).
// DELETE /api/onboarding/verticals/[id]?purge=1 → HARD delete (permanent). platform.manage.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await onboardingService.hardDeleteVertical(params.id, g.ctx.userId);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await onboardingService.softDeleteVertical(params.id, g.ctx.userId);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/onboarding/verticals/[id] DELETE");
}
