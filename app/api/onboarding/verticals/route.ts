import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { onboardingService, type CreateVerticalInput } from "@/modules/onboarding/service";

export const runtime = "nodejs";

// GET /api/onboarding/verticals → the vertical catalog (HR / Sales / other).
// Readable by any tenant admin during onboarding. tenant.settings.manage.
export async function GET() {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await onboardingService.listVerticals()),
    "api/onboarding/verticals GET",
  );
}

// POST /api/onboarding/verticals → create a vertical (catalog). platform.manage.
export async function POST(req: Request) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateVerticalInput;
    const row = await onboardingService.createVertical(body, g.ctx.userId);
    return ok(row, { status: 201 });
  }, "api/onboarding/verticals POST");
}
