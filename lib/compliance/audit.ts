import { desc } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { auditLogTable } from "@/lib/db/schema";

// Append-only audit trail for sensitive actions (doc 25/26): DSAR, retention
// purge, posture changes, mailbox connect, etc.
export async function recordAudit(
  ctx: TenantContext,
  action: string,
  target?: string | null,
  meta?: Record<string, unknown>,
): Promise<void> {
  await withTenant(ctx, (tx) =>
    tx.insert(auditLogTable).values({
      id: "aud_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action,
      target: target ?? null,
      meta: meta ?? null,
    }),
  );
}

export async function recentAudit(ctx: TenantContext, limit = 50) {
  return withTenant(ctx, (tx) =>
    tx.select().from(auditLogTable).orderBy(desc(auditLogTable.at)).limit(limit),
  );
}
