// Semi-auto draft store. When a tenant runs WA in "semi" mode, the AI reply is
// held here for a rep to approve before it's sent (instead of auto-enqueued).
// platformSettingTable key/value, no migration — keyed `wadraft:<conversationId>`.

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { platformSettingTable } from "@/lib/db/schema";

export interface WaDraft {
  sessionId: string;
  to: string;
  bubbles: { text: string; delayMs: number }[];
}

const keyFor = (conversationId: string) => `wadraft:${conversationId}`;

export async function saveDraft(conversationId: string, draft: WaDraft): Promise<void> {
  const value = JSON.stringify(draft);
  await db
    .insert(platformSettingTable)
    .values({ key: keyFor(conversationId), value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettingTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function loadDraft(conversationId: string): Promise<WaDraft | null> {
  const [row] = await db
    .select()
    .from(platformSettingTable)
    .where(eq(platformSettingTable.key, keyFor(conversationId)))
    .limit(1);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as WaDraft;
  } catch {
    return null;
  }
}

export async function clearDraft(conversationId: string): Promise<void> {
  await db.delete(platformSettingTable).where(eq(platformSettingTable.key, keyFor(conversationId)));
}
