import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { settingsService } from "@/modules/settings/service";

export const runtime = "nodejs";

// GET /api/settings/billing → facade-level billing summary: the tenant's AI-credit
// balance + Stripe wiring flags. REUSE: delegates to lib/billing/* (the full
// plan/usage/quota view lives on /api/tenant/billing). tenant.billing.
export async function GET() {
  // Recovery surface — a non-active tenant still sees its billing summary so it
  // can pay / reactivate (audit #6).
  const g = await requirePermission("tenant.billing", { allowInactiveTenant: true });
  if ("error" in g) return g.error;
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await settingsService.getBillingSummary(g.ctx)),
    "api/settings/billing GET",
  );
}
