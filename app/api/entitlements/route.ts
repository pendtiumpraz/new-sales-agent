import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { onboardingService } from "@/modules/onboarding/service";

export const runtime = "nodejs";

// GET /api/entitlements → resolve the tenant's effective module access + quota
// overrides (core ∪ vertical bundle minus disabled). tenant.settings.manage.
export async function GET() {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await onboardingService.resolveEntitlements(g.ctx)),
    "api/entitlements GET",
  );
}

// POST /api/entitlements → toggle a single module for the tenant (per-tenant
// on/off). Core modules cannot be disabled. tenant.settings.manage.
// Body: { moduleKey: string, enabled: boolean }
export async function POST(req: Request) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as { moduleKey?: string; enabled?: boolean };
    if (!body.moduleKey) return fail("Missing moduleKey", 400, "validation");
    if (typeof body.enabled !== "boolean") return fail("Missing enabled flag", 400, "validation");
    return ok(
      await onboardingService.setEntitlement(g.ctx, body.moduleKey, body.enabled, g.ctx.userId),
    );
  }, "api/entitlements POST");
}
