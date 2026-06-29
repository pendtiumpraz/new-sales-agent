import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { onboardingService } from "@/modules/onboarding/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/onboarding/modules/[id] → one catalog module. tenant.settings.manage.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await onboardingService.getModule(params.id)),
    "api/onboarding/modules/[id] GET",
  );
}

// DELETE /api/onboarding/modules/[id] → SOFT delete (sets deleted_at). platform.manage.
export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    await onboardingService.softDeleteModule(params.id, g.ctx.userId);
    return ok({ id: params.id, deleted: true });
  }, "api/onboarding/modules/[id] DELETE");
}
