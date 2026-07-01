import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { superadminService } from "@/modules/superadmin/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// PATCH /api/superadmin/tenants/[id]/activation → set activation window + quotas
// for an existing tenant in one call (composite of tenant activate + setQuota).
// Body: { activeUntil?: ISO|null, planKey?: string, verticalKey?: string,
//         quotas?: { [metric]: number|null }, note?: string }
// platform.manage.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("platform.manage");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      activeUntil?: string | null;
      planKey?: string;
      verticalKey?: string;
      quotas?: Record<string, number | null>;
      note?: string;
    };
    const row = await superadminService.setActivationWindow(g.ctx, params.id, body, g.ctx.userId);
    return ok(row);
  }, "api/superadmin/tenants/[id]/activation PATCH");
}
