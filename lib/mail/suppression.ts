import { and, eq } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { suppressionTable } from "@/lib/db/schema";
import { stableId } from "@/lib/profiling/dedup";

// Compliance gate (doc 25): opted-out / bounced / complained addresses are never
// sent to. Enforced in the send worker, not just the UI.

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

export async function isSuppressed(tx: Tx, tenantId: string, email: string): Promise<boolean> {
  const r = await tx
    .select({ id: suppressionTable.id })
    .from(suppressionTable)
    .where(and(eq(suppressionTable.tenantId, tenantId), eq(suppressionTable.email, email.trim().toLowerCase())))
    .limit(1);
  return r.length > 0;
}

export async function addSuppression(ctx: TenantContext, email: string, reason = "opt_out"): Promise<void> {
  const e = email.trim().toLowerCase();
  await withTenant(ctx, (tx) =>
    tx
      .insert(suppressionTable)
      .values({ id: stableId("sup", `${ctx.tenantId}:${e}`), tenantId: ctx.tenantId, email: e, reason })
      .onConflictDoNothing(),
  );
}
