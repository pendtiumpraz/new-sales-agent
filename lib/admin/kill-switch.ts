import { eq } from "drizzle-orm";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { tenantsTable } from "@/lib/db/schema";

export interface TenantActivation {
  status: string; // active | suspended | pending
  activeUntil: Date | null;
  active: boolean; // status === active AND not expired
  reason: "ok" | "suspended" | "pending" | "expired" | "unknown";
}

/**
 * Full activation status (doc 38). A tenant is usable only when status='active'
 * AND it hasn't passed its activeUntil date. Superadmin sets both on activation.
 */
export async function tenantActivation(ctx: TenantContext): Promise<TenantActivation> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ status: tenantsTable.status, activeUntil: tenantsTable.activeUntil })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, ctx.tenantId))
      .limit(1),
  );
  const status = row?.status ?? "active";
  const activeUntil = row?.activeUntil ?? null;
  if (status === "suspended") return { status, activeUntil, active: false, reason: "suspended" };
  if (status === "pending") return { status, activeUntil, active: false, reason: "pending" };
  if (activeUntil && activeUntil.getTime() < Date.now()) {
    return { status, activeUntil, active: false, reason: "expired" };
  }
  return { status, activeUntil, active: true, reason: "ok" };
}

// Kill-switch (doc 26/38): a suspended / pending / expired tenant can't run AI or
// send email. Checked at the top of the AI meter and the send worker.
export async function isTenantActive(ctx: TenantContext): Promise<boolean> {
  return (await tenantActivation(ctx)).active;
}
