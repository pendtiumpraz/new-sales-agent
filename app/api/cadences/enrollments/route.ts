import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { outreachService, type EnrollInput } from "@/modules/outreach/service";

export const runtime = "nodejs";

// GET /api/cadences/enrollments → list enrollments. ?cadenceId= / ?contactId= /
// ?status= filters; ?due=1 lists only enrollments whose next_run_at is past. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const due = sp.get("due");
  if (due === "1" || due === "true") {
    const limit = Number(sp.get("limit")) || undefined;
    return handle(
      async () => ok(await outreachService.listDueEnrollments(g.ctx, limit)),
      "api/cadences/enrollments GET due",
    );
  }
  const filter = {
    cadenceId: sp.get("cadenceId") ?? undefined,
    contactId: sp.get("contactId") ?? undefined,
    status: sp.get("status") ?? undefined,
  };
  return handle(
    async () => ok(await outreachService.listEnrollments(g.ctx, filter)),
    "api/cadences/enrollments GET",
  );
}

// POST /api/cadences/enrollments → enroll a contact (body carries cadenceId +
// contactId). Mirrors POST /api/cadences/[id]/enroll. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as EnrollInput;
    return ok(await outreachService.enroll(g.ctx, body), { status: 201 });
  }, "api/cadences/enrollments POST");
}
