import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { settingsService } from "@/modules/settings/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// PATCH /api/settings/kb/[id]/restore → clear deleted_at (un-trash). tenant.settings.manage.
export async function PATCH(_req: Request, { params }: Ctx) {
  const g = await requirePermission("tenant.settings.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await settingsService.restoreKb(g.ctx, params.id)),
    "api/settings/kb/[id]/restore PATCH",
  );
}
