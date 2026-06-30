import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle, parseLimit, type Page } from "@/modules/_shared/api";
import { inboxService, type CreateMessageInput } from "@/modules/inbox/service";
import type { MessageRow } from "@/modules/inbox/schema";

export const runtime = "nodejs";

// GET /api/messages?conversationId=… → the MOST-RECENT page of messages in a
// conversation (ascending for display) + a `nextCursor` to lazily load older
// bubbles. Supports ?direction=in|out, ?limit=, ?cursor=. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  const empty: Page<MessageRow> = { items: [], nextCursor: null };
  if (!hasDb()) return ok(empty);
  const sp = new URL(req.url).searchParams;
  const conversationId = sp.get("conversationId") ?? "";
  const direction = sp.get("direction") ?? undefined;
  const page = { limit: parseLimit(sp.get("limit")), cursor: sp.get("cursor") ?? undefined };
  return handle(
    async () => ok(await inboxService.pageMessages(g.ctx, conversationId, page, direction)),
    "api/messages GET",
  );
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
