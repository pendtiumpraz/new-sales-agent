// Persist the conversation stage (Phase 3). platformSettingTable key/value, so
// no schema migration — keyed `convstage:<conversationId>`.

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { platformSettingTable } from "@/lib/db/schema";
import type { Stage } from "@/lib/sales/stage-machine";

const keyFor = (conversationId: string) => `convstage:${conversationId}`;

const VALID: Stage[] = ["rapport", "discovery", "value", "objection", "closing"];

export async function loadStage(conversationId: string): Promise<Stage | undefined> {
  const [row] = await db
    .select()
    .from(platformSettingTable)
    .where(eq(platformSettingTable.key, keyFor(conversationId)))
    .limit(1);
  const v = row?.value as Stage | undefined;
  return v && VALID.includes(v) ? v : undefined;
}

export async function saveStage(conversationId: string, stage: Stage): Promise<void> {
  await db
    .insert(platformSettingTable)
    .values({ key: keyFor(conversationId), value: stage, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettingTable.key,
      set: { value: stage, updatedAt: new Date() },
    });
}
