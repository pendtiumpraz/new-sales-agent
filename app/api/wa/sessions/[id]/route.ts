import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { waService, type UpdateSessionInput } from "@/modules/wa/service";
import type { WaSessionRow } from "@/modules/wa/schema";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/wa/sessions/[id] → one WA session (status, QR, phone, heartbeat). data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await waService.getSession(g.ctx, params.id)),
    "api/wa/sessions/[id] GET",
  );
}

// PATCH /api/wa/sessions/[id] → gateway/UI update of session state (QR scanned →
// connected, heartbeat, phone number). data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateSessionInput;
    return ok(await waService.updateSession(g.ctx, params.id, body));
  }, "api/wa/sessions/[id] PATCH");
}

// DELETE /api/wa/sessions/[id]            → disconnect (status=disconnected).
// DELETE /api/wa/sessions/[id]?remove=1   → hard remove the session row. data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const remove = new URL(req.url).searchParams.get("remove");
  const hard = remove === "1" || remove === "true";
  return handle<WaSessionRow | { id: string; removed: boolean }>(async () => {
    if (hard) {
      await waService.deleteSession(g.ctx, params.id);
      return ok({ id: params.id, removed: true });
    }
    return ok(await waService.disconnectSession(g.ctx, params.id));
  }, "api/wa/sessions/[id] DELETE");
}
