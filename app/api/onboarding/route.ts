import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { onboardingService, type AdvanceOnboardingInput } from "@/modules/onboarding/service";

export const runtime = "nodejs";

// GET /api/onboarding → the tenant's onboarding state (defaults to step=vertical).
// tenant.settings.manage (owner/admin). Scoped to the session's own tenant.
export async function GET() {
  // Recovery surface — a pending tenant runs onboarding before activation, so it
  // opts out of the tenant-active gate (audit #6).
  const g = await requirePermission("tenant.settings.manage", { allowInactiveTenant: true });
  if ("error" in g) return g.error;
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await onboardingService.getState(g.ctx)), "api/onboarding GET");
}

// PATCH /api/onboarding → advance the state machine. Setting verticalKey ALSO
// seeds entitlements from the vertical bundle. tenant.settings.manage.
// Body: { step?, verticalKey?, selectedModules?, data?, complete? }
export async function PATCH(req: Request) {
  // Recovery surface — onboarding advances while the tenant is still pending.
  const g = await requirePermission("tenant.settings.manage", { allowInactiveTenant: true });
  if ("error" in g) return g.error;
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as AdvanceOnboardingInput;
    return ok(await onboardingService.advance(g.ctx, body, g.ctx.userId));
  }, "api/onboarding PATCH");
}
