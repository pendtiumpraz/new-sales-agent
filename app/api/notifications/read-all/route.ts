import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, handle } from "@/modules/_shared/api";
import { notificationService } from "@/modules/notification/service";

export const runtime = "nodejs";

// POST /api/notifications/read-all → mark every visible unread notification read.
// Returns how many were flipped. data.read (read-state flip on the caller's feed).
export async function POST() {
  const g = await requirePermission("data.read");
  if ("error" in g) return g.error;
  if (!hasDb()) return ok({ marked: 0, unread: 0 });
  return handle(async () => {
    const marked = await notificationService.markAllRead(g.ctx);
    return ok({ marked, unread: 0 });
  }, "api/notifications/read-all POST");
}
