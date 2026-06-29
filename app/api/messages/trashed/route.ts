import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, fail, handle } from "@/modules/_shared/api";
import { inboxService } from "@/modules/inbox/service";

export const runtime = "nodejs";

// GET /api/messages/trashed → soft-deleted messages (restore candidates). data.read.
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return fail("Forbidden", 403, "forbidden");
  if (!hasDb()) return ok([]);
  return handle(
    async () => ok(await inboxService.listTrashedMessages(g.ctx)),
    "api/messages/trashed GET",
  );
}
