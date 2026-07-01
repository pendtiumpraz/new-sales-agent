import { hasDb } from "@/lib/db/client";
import { requirePermission } from "@/lib/rbac/guard";

import { ok, handle } from "@/modules/_shared/api";
import { notificationService } from "@/modules/notification/service";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

// POST /api/notifications/[id]/read → mark one notification read; returns the new
// unread count so the bell badge updates immediately. data.read (a read-state
// flip on the caller's own feed, not a data write).
export async function POST(_req: Request, { params }: Ctx) {
  const g = await requirePermission("data.read");
  if ("error" in g) return g.error;
  if (!hasDb()) return ok({ marked: false, unread: 0 });
  return handle(async () => {
    const marked = await notificationService.markRead(g.ctx, params.id);
    const unread = await notificationService.countUnread(g.ctx);
    return ok({ marked, unread });
  }, "api/notifications/[id]/read POST");
}
