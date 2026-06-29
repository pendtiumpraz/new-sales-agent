import { hasDb } from "@/lib/db/client";
import { getTenantContext } from "@/lib/auth/session-context";

import { ok, fail, handle } from "@/modules/_shared/api";
import { brandingService, type ThemePatch } from "@/modules/branding/service";

export const runtime = "nodejs";

/**
 * Branding is PER-USER: any authenticated user manages their OWN theme, so these
 * routes authorize on the session itself (resolving `userId` from the tenant
 * context) rather than a superadmin-style `platform.manage` permission. The
 * resource is always "the current user's theme" — there is no `[id]` to target.
 */

// GET /api/branding/theme → the current user's resolved theme + CSS vars.
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return fail("Unauthorized", 401, "unauthorized");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const theme = await brandingService.getTheme(ctx.userId);
    return ok({ theme, vars: brandingService.resolveThemeVars(theme) });
  }, "api/branding/theme GET");
}

// PUT /api/branding/theme → upsert a partial theme patch for the current user.
export async function PUT(req: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return fail("Unauthorized", 401, "unauthorized");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as ThemePatch;
    const theme = await brandingService.saveTheme(ctx.userId, body, ctx.tenantId);
    return ok({ theme, vars: brandingService.resolveThemeVars(theme) });
  }, "api/branding/theme PUT");
}
