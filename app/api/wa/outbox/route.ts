import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { waService, type QueueOutboxInput } from "@/modules/wa/service";

export const runtime = "nodejs";

// GET /api/wa/outbox → list queued/sent outbound WA messages. Supports
// ?status= / ?conversationId= filters. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const filter = {
    status: sp.get("status") ?? undefined,
    conversationId: sp.get("conversationId") ?? undefined,
  };
  return handle(async () => ok(await waService.listOutbox(g.ctx, filter)), "api/wa/outbox GET");
}

// POST /api/wa/outbox → QUEUE an outbound WA message (REPLY-ONLY: the conversation
// must already have an inbound message). Computes the pacing scheduled_at and
// persists a queued inbox message. The external gateway sends it. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as QueueOutboxInput;
    return ok(await waService.queueOutbox(g.ctx, body), { status: 201 });
  }, "api/wa/outbox POST");
}
