import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { platformSettingTable } from "@/lib/db/schema";

// Generic platform settings (doc 41) — superadmin key/value. Used for
// deployment_mode (saas | on_prem) which gates the cross-tenant marketplace.

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(platformSettingTable).where(eq(platformSettingTable.key, key)).limit(1);
  return row?.value ?? null;
}
export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(platformSettingTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: platformSettingTable.key, set: { value, updatedAt: new Date() } });
}

export type DeploymentMode = "saas" | "on_prem";
export async function getDeploymentMode(): Promise<DeploymentMode> {
  return (await getSetting("deployment_mode")) === "on_prem" ? "on_prem" : "saas";
}
// The cross-tenant marketplace only exists in SaaS mode.
export async function marketplaceEnabled(): Promise<boolean> {
  return (await getDeploymentMode()) === "saas";
}

// Consent values acceptable for listing a PERSON in the marketplace (UU PDP).
export const SHAREABLE_CONSENT = ["opted_in", "legitimate_interest"];
