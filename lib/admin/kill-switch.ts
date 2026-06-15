import { eq } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { tenantsTable } from "@/lib/db/schema";

// Kill-switch (doc 26): a suspended tenant can't run AI or send email. Checked at
// the top of the AI meter and the send worker.
export async function isTenantActive(ctx: TenantContext): Promise<boolean> {
  const r = await withTenant(ctx, (tx) =>
    tx.select({ status: tenantsTable.status }).from(tenantsTable).where(eq(tenantsTable.id, ctx.tenantId)).limit(1),
  );
  return (r[0]?.status ?? "active") !== "suspended";
}
