import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { retentionService, type EnrollInput } from "@/modules/retention/service";

export const runtime = "nodejs";

// GET /api/retention/enrollments → list retention enrollments. Optional
// ?flowId= / ?contactId= / ?status= filters. Drives the per-flow enrolled count
// on the /retention page. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const filter = {
    flowId: sp.get("flowId") ?? undefined,
    contactId: sp.get("contactId") ?? undefined,
    status: sp.get("status") ?? undefined,
  };
  return handle(
    async () => ok(await retentionService.listEnrollments(g.ctx, filter)),
    "api/retention/enrollments GET",
  );
}

// POST /api/retention/enrollments → enroll a contact (body carries flowId +
// contactId). Mirrors POST /api/retention/flows/[id]/enroll. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as EnrollInput;
    return ok(await retentionService.enroll(g.ctx, body), { status: 201 });
  }, "api/retention/enrollments POST");
}
