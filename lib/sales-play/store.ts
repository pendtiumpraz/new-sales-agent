// Persist a workspace's Sales Play. platformSettingTable key/value, no migration —
// keyed `salesplay:<workspaceId>`. Gated by the workspace route's tenant check.

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { platformSettingTable } from "@/lib/db/schema";
import type { SalesPlay } from "@/lib/types/sales-play";

const keyFor = (workspaceId: string) => `salesplay:${workspaceId}`;

export async function saveSalesPlay(workspaceId: string, plan: SalesPlay): Promise<void> {
  const value = JSON.stringify(plan);
  await db
    .insert(platformSettingTable)
    .values({ key: keyFor(workspaceId), value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettingTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function loadSalesPlay(workspaceId: string): Promise<SalesPlay | null> {
  const [row] = await db
    .select()
    .from(platformSettingTable)
    .where(eq(platformSettingTable.key, keyFor(workspaceId)))
    .limit(1);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as SalesPlay;
  } catch {
    return null;
  }
}
