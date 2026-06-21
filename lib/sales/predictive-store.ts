// Persist a conversation's latest closing-readiness (Phase 4). platformSettingTable
// key/value, no migration — keyed `convscore:<conversationId>`.

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { platformSettingTable } from "@/lib/db/schema";
import type { Readiness } from "@/lib/sales/predictive";

const keyFor = (conversationId: string) => `convscore:${conversationId}`;

export async function saveReadiness(
  conversationId: string,
  readiness: Readiness,
): Promise<void> {
  const value = JSON.stringify(readiness);
  await db
    .insert(platformSettingTable)
    .values({ key: keyFor(conversationId), value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettingTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function loadReadiness(
  conversationId: string,
): Promise<Readiness | null> {
  const [row] = await db
    .select()
    .from(platformSettingTable)
    .where(eq(platformSettingTable.key, keyFor(conversationId)))
    .limit(1);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as Readiness;
  } catch {
    return null;
  }
}
