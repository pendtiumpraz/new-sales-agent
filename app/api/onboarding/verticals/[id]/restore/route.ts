import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { onboardingService } from "@/modules/onboarding/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// PATCH /api/onboarding/verticals/[id]/restore → clear deleted_at. platform.manage.
export async function PATCH(_req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await onboardingService.restoreVertical(params.id, g.ctx.userId)),
    "api/onboarding/verticals/[id]/restore PATCH",
  );
}
