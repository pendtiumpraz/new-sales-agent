import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { tenantEntitlementTable, tenantsTable } from "@/lib/db/schema";

// Per-tenant module entitlement (doc 44). Superadmin can disable modules per
// tenant (not every client buys everything). Absent row = ENABLED (default on),
// so a fresh tenant gets everything until a superadmin turns something off.

export interface ModuleDef {
  key: string; // = the route/href, used as the toggle key + sidebar match
  label: string;
}

// Toggleable modules (Dashboard / Panduan / Pengaturan are core — always on).
export const MODULES: ModuleDef[] = [
  { key: "/contacts", label: "Kontak & Lead" },
  { key: "/workspaces", label: "Workspace" },
  { key: "/pipeline", label: "Riset Prospek" },
  { key: "/marketplace", label: "Marketplace" },
  { key: "/cadences", label: "Cadence" },
  { key: "/escalations", label: "Eskalasi AI" },
  { key: "/content", label: "Konten" },
  { key: "/retention", label: "Retensi" },
  { key: "/ecommerce", label: "E-Commerce" },
  { key: "/field", label: "Sales Lapangan" },
  { key: "/team", label: "Monitoring Sales" },
  { key: "/reports", label: "Laporan" },
  { key: "/autopilot", label: "Autopilot" },
];

// Disabled module keys for one tenant (raw db — used pre-render + cross-tenant).
export async function disabledForTenant(tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ moduleKey: tenantEntitlementTable.moduleKey })
    .from(tenantEntitlementTable)
    .where(and(eq(tenantEntitlementTable.tenantId, tenantId), eq(tenantEntitlementTable.enabled, false)));
  return rows.map((r) => r.moduleKey);
}

export async function setEntitlement(tenantId: string, moduleKey: string, enabled: boolean): Promise<void> {
  await db
    .insert(tenantEntitlementTable)
    .values({ id: "ent_" + tenantId + "_" + moduleKey, tenantId, moduleKey, enabled })
    .onConflictDoUpdate({ target: [tenantEntitlementTable.tenantId, tenantEntitlementTable.moduleKey], set: { enabled } });
}

// Full matrix for the superadmin console: every tenant × disabled-module list.
export async function entitlementMatrix(): Promise<{
  tenants: { id: string; name: string }[];
  modules: ModuleDef[];
  disabled: Record<string, string[]>;
}> {
  const [tenants, rows] = await Promise.all([
    db.select({ id: tenantsTable.id, name: tenantsTable.name }).from(tenantsTable),
    db.select().from(tenantEntitlementTable).where(eq(tenantEntitlementTable.enabled, false)),
  ]);
  const disabled: Record<string, string[]> = {};
  for (const r of rows) {
    (disabled[r.tenantId] ??= []).push(r.moduleKey);
  }
  return { tenants, modules: MODULES, disabled };
}
