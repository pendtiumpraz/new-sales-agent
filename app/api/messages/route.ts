import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { inboxService, type CreateMessageInput } from "@/modules/inbox/service";

export const runtime = "nodejs";

// GET /api/messages?conversationId=… → messages in a conversation (oldest→newest).
// Supports ?direction=in|out. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const filter = {
    conversationId: sp.get("conversationId") ?? undefined,
    direction: sp.get("direction") ?? undefined,
  };
  return handle(async () => ok(await inboxService.listMessages(g.ctx, filter)), "api/messages GET");
}

// POST /api/messages → append a message to a conversation (in|out). Bumps the
// conversation preview + unread count. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateMessageInput;
    return ok(await inboxService.createMessage(g.ctx, body), { status: 201 });
  }, "api/messages POST");
}
