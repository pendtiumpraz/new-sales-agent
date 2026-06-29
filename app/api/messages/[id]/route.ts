import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { inboxService, type UpdateMessageInput } from "@/modules/inbox/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// GET /api/messages/[id] → one message. data.read.
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(
    async () => ok(await inboxService.getMessage(g.ctx, params.id)),
    "api/messages/[id] GET",
  );
}

// PATCH /api/messages/[id] → update a message (e.g. delivery status). data.write.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  return handle(async () => {
    const body = (await req.json()) as UpdateMessageInput;
    return ok(await inboxService.updateMessage(g.ctx, params.id, body));
  }, "api/messages/[id] PATCH");
}

// DELETE /api/messages/[id]         → SOFT delete (sets deleted_at).
// DELETE /api/messages/[id]?purge=1 → HARD delete (permanent). data.write.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requirePermission("data.write");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return fail("Database tidak tersedia", 503, "no_db");
  const purge = new URL(req.url).searchParams.get("purge");
  const hard = purge === "1" || purge === "true";
  return handle(async () => {
    if (hard) {
      await inboxService.hardDeleteMessage(g.ctx, params.id);
      return ok({ id: params.id, deleted: true, purged: true });
    }
    await inboxService.softDeleteMessage(g.ctx, params.id);
    return ok({ id: params.id, deleted: true, purged: false });
  }, "api/messages/[id] DELETE");
}
