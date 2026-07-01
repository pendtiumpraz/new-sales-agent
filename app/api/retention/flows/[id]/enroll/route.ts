import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { retentionService, type EnrollInput } from "@/modules/retention/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/retention/flows/[id]/enroll → enroll a contact into this retention
// flow (schedules the first step). Body: { contactId, workspaceId?,
// assignedUserId? }. Mirrors POST /api/cadences/[id]/enroll. data.write.
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as Omit<EnrollInput, "flowId">;
    return ok(
      await retentionService.enroll(g.ctx, { ...body, flowId: params.id }),
      { status: 201 },
    );
  }, "api/retention/flows/[id]/enroll POST");
}
