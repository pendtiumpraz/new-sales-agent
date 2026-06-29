import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { waService } from "@/modules/wa/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/wa/outbox/[id] → one outbox row. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await waService.getOutbox(g.ctx, params.id)), "api/wa/outbox/[id] GET");
}

// PATCH /api/wa/outbox/[id] → gateway reports the send outcome. Body:
//   { result: "sent" }                    → outbox+message sent
//   { result: "failed", error?: string }  → outbox+message failed (attempts++)
//   { result: "cancel" }                  → cancel a still-queued row
//   { status: "sending" }                 → generic claim/status patch
// data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      result?: string;
      error?: string;
      status?: string;
    };
    if (body.result === "sent") return ok(await waService.markSent(g.ctx, params.id));
    if (body.result === "failed")
      return ok(await waService.markFailed(g.ctx, params.id, body.error));
    if (body.result === "cancel") return ok(await waService.cancelOutbox(g.ctx, params.id));
    if (body.status) return ok(await waService.updateOutboxStatus(g.ctx, params.id, body.status));
    return fail("result atau status wajib diisi", 400, "validation");
  }, "api/wa/outbox/[id] PATCH");
}

// DELETE /api/wa/outbox/[id] → cancel a still-queued outbox row. data.write.
export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => ok(await waService.cancelOutbox(g.ctx, params.id)), "api/wa/outbox/[id] DELETE");
}
