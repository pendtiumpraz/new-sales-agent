import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { superadminService } from "@/modules/superadmin/service";

export const runtime = "nodejs";

// GET /api/superadmin/settings → all platform k/v settings. platform.manage.
export async function GET() {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(async () => ok(await superadminService.listSettings()), "api/superadmin/settings GET");
}

// PUT /api/superadmin/settings → upsert one setting. platform.manage.
// Body: { key: string, value: string }
export async function PUT(req: Request) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { key?: string; value?: string };
    if (!body.key) return fail("Key wajib diisi", 400, "validation");
    const row = await superadminService.setSetting(body.key, body.value ?? "", g.ctx.userId);
    return ok(row);
  }, "api/superadmin/settings PUT");
}
