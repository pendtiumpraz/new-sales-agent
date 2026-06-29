import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { fieldService, type CreateCheckInInput } from "@/modules/field/service";

export const runtime = "nodejs";

// GET /api/field/check-ins?visitId=… → geo-stamped check-ins of a visit. data.read.
// A check-in belongs to a visit, so `visitId` is required (or use the nested
// /api/field/visits/[id]/check-ins route).
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const visitId = new URL(req.url).searchParams.get("visitId");
  if (!visitId) return fail("Parameter visitId wajib diisi", 400, "validation");
  return handle(
    async () => ok(await fieldService.listCheckIns(g.ctx, visitId)),
    "api/field/check-ins GET",
  );
}

// POST /api/field/check-ins → create a check-in lapangan. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateCheckInInput;
    return ok(await fieldService.createCheckIn(g.ctx, body), { status: 201 });
  }, "api/field/check-ins POST");
}
