// Persist a workspace's Market-Fit result. Uses platformSettingTable (key/value)
// so there's NO schema migration — keyed `marketfit:<workspaceId>`. Access is
// always gated by the workspace route's tenant/owner check before reaching here.

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { platformSettingTable } from "@/lib/db/schema";
import type { MarketFitResult } from "@/lib/types/market-fit";

const keyFor = (workspaceId: string) => `marketfit:${workspaceId}`;

export async function saveMarketFit(
  workspaceId: string,
  result: MarketFitResult,
): Promise<void> {
  const value = JSON.stringify(result);
  await db
    .insert(platformSettingTable)
    .values({ key: keyFor(workspaceId), value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettingTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function loadMarketFit(
  workspaceId: string,
): Promise<MarketFitResult | null> {
  const [row] = await db
    .select()
    .from(platformSettingTable)
    .where(eq(platformSettingTable.key, keyFor(workspaceId)))
    .limit(1);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as MarketFitResult;
  } catch {
    return null;
  }
}
