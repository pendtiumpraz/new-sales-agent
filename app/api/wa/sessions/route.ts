import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { waService, type CreateSessionInput } from "@/modules/wa/service";

export const runtime = "nodejs";

// Rebuild (Sainskerta Loop M4) WA session routes — a PARALLEL greenfield surface
// to the legacy `app/api/wa/session/*` (which drives the prototype's single
// per-account WAHA connect flow). The rebuild models MULTIPLE sessions per
// rep/account over `wa_session_v2` and returns the {ok,data} envelope, so it is
// mounted at the PLURAL `wa/sessions/*` to coexist without overwriting the live
// legacy route — the same non-collision rationale as the `_v2` table names.

// GET /api/wa/sessions → list the tenant's WA sessions. ?userId= filters to a rep.
// data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const userId = new URL(req.url).searchParams.get("userId") ?? undefined;
  return handle(async () => ok(await waService.listSessions(g.ctx, userId)), "api/wa/sessions GET");
}

// POST /api/wa/sessions → open a WA connection (status defaults to `qr` so the
// external gateway can attach a pairing payload). data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as CreateSessionInput;
    return ok(await waService.createSession(g.ctx, body), { status: 201 });
  }, "api/wa/sessions POST");
}
