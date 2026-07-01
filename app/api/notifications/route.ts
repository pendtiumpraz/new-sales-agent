import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, handle } from "@/modules/_shared/api";
import { notificationService } from "@/modules/notification/service";

export const runtime = "nodejs";

// GET /api/notifications → the caller's feed (tenant-wide ∪ own, newest first)
// plus the unread badge count. data.read. In pure-mock mode there is no store, so
// return an empty feed (the bell renders no badge, no error).
export async function GET() {
  const g = await requirePermission("data.read");
  if ("error" in g) return g.error;
  if (!hasDb()) return ok({ items: [], unread: 0 });
  return handle(async () => {
    const [items, unread] = await Promise.all([
      notificationService.list(g.ctx),
      notificationService.countUnread(g.ctx),
    ]);
    return ok({ items, unread });
  }, "api/notifications GET");
}
