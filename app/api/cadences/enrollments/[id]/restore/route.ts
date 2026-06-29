import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService } from "@/modules/outreach/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// PATCH /api/cadences/enrollments/[id]/restore → un-trash an enrollment. data.write.
export async function PATCH(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await outreachService.restoreEnrollment(g.ctx, params.id)),
    "api/cadences/enrollments/[id]/restore PATCH",
  );
}
