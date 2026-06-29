import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { waService } from "@/modules/wa/service";

export const runtime = "nodejs";

// GET /api/wa/outbox/sendable → the external gateway (extension/WAHA) polls this
// for queued rows whose pacing delay has elapsed (scheduled_at ≤ now), oldest
// first. ?limit= caps the batch. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const raw = new URL(req.url).searchParams.get("limit");
  const limit = raw ? Math.min(Math.max(Number(raw) || 0, 1), 100) : 20;
  return handle(async () => ok(await waService.listSendable(g.ctx, limit)), "api/wa/outbox/sendable GET");
}
