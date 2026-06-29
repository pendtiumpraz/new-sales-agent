import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { settingsService } from "@/modules/settings/service";

export const runtime = "nodejs";

// GET /api/settings/compliance → the tenant's compliance settings (key/value),
// stored in `tenant_settings` under the `compliance.` namespace. data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok({});
  return handle(
    async () => ok(await settingsService.getCompliance(g.ctx)),
    "api/settings/compliance GET",
  );
}

// PATCH /api/settings/compliance → set compliance settings. tenant.settings.manage.
//   Body { key, value }                  → set a single setting, OR
//   Body { settings: { k: v, ... } }     → bulk set.
export async function PATCH(req: Request) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as {
      key?: string;
      value?: unknown;
      settings?: Record<string, unknown>;
    };
    if (body?.settings && typeof body.settings === "object") {
      return ok(await settingsService.setComplianceBulk(g.ctx, body.settings));
    }
    if (!body?.key) return fail("key atau settings wajib diisi", 400, "validation");
    await settingsService.setCompliance(g.ctx, body.key, body.value);
    return ok(await settingsService.getCompliance(g.ctx));
  }, "api/settings/compliance PATCH");
}
