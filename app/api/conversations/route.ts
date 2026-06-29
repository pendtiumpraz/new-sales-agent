import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { inboxService, type CreateConversationInput } from "@/modules/inbox/service";

export const runtime = "nodejs";

// GET /api/conversations → list the tenant's live conversations (inbox threads).
// Supports ?contactId= / ?workspaceId= / ?channel= / ?status= filters. data.read.
export async function GET(req: Request) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  const sp = new URL(req.url).searchParams;
  const filter = {
    contactId: sp.get("contactId") ?? undefined,
    workspaceId: sp.get("workspaceId") ?? undefined,
    channel: sp.get("channel") ?? undefined,
    status: sp.get("status") ?? undefined,
  };
  return handle(
    async () => ok(await inboxService.listConversations(g.ctx, filter)),
    "api/conversations GET",
  );
}

// POST /api/conversations → open a conversation for a contact on a channel. data.write.
export async function POST(req: Request) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as CreateConversationInput;
    return ok(await inboxService.createConversation(g.ctx, body), { status: 201 });
  }, "api/conversations POST");
}
