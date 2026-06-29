import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService, type EnrollInput } from "@/modules/outreach/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/cadences/[id]/enroll → enroll a contact in this cadence (schedules the
// first step). Body: { contactId, workspaceId?, conversationId?, assignedUserId? }.
// data.write.
export async function POST(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as Omit<EnrollInput, "cadenceId">;
    return ok(
      await outreachService.enroll(g.ctx, { ...body, cadenceId: params.id }),
      { status: 201 },
    );
  }, "api/cadences/[id]/enroll POST");
}
