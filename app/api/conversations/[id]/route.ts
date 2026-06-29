import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { inboxService, type UpdateConversationInput } from "@/modules/inbox/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/conversations/[id] → one conversation. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await inboxService.getConversation(g.ctx, params.id)),
    "api/conversations/[id] GET",
  );
}

// PATCH /api/conversations/[id] → update a conversation. Pass {markRead:true} to
// reset the unread counter to 0. data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateConversationInput & { markRead?: boolean };
    if (body.markRead) return ok(await inboxService.markRead(g.ctx, params.id));
    return ok(await inboxService.updateConversation(g.ctx, params.id, body));
  }, "api/conversations/[id] PATCH");
}

// DELETE /api/conversations/[id]         → SOFT delete (cascades to messages).
// DELETE /api/conversations/[id]?purge=1 → HARD delete (permanent). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await inboxService.hardDeleteConversation(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await inboxService.softDeleteConversation(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/conversations/[id] DELETE");
}
