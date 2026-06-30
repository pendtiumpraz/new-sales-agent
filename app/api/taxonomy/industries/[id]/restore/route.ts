import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { taxonomyService } from "@/modules/taxonomy/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// PATCH /api/taxonomy/industries/[id]/restore → clear deleted_at (un-trash). data.write.
export async function PATCH(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await taxonomyService.restoreIndustry(g.ctx, params.id)),
    "api/taxonomy/industries/[id]/restore PATCH",
  );
}
