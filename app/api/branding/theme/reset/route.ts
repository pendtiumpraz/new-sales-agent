import { hasDb } from "@/lib/db/client";
import { getTenantContext } from "@/lib/auth/session-context";

import { ok, fail, handle } from "@/modules/_shared/api";
import { brandingService } from "@/modules/branding/service";

export const runtime = "nodejs";

// POST /api/branding/theme/reset → revert the current user's theme to the
// Coral-Sunset defaults (clears the satellite row). Per-USER; session-authorized.
// This is the satellite equivalent of restore/trash for FK-free per-row theming.
export async function POST() {
  const ctx = await getTenantContext();
  if (!ctx) return fail("Unauthorized", 401, "unauthorized");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const theme = await brandingService.resetTheme(ctx.userId, ctx.tenantId);
    return ok({ theme, vars: brandingService.resolveThemeVars(theme) });
  }, "api/branding/theme/reset POST");
}
