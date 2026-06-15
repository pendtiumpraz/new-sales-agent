import { and, eq } from "drizzle-orm";
import type { LanguageModel } from "ai";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import {
  aiCredentialTable,
  aiModelTable,
  aiProviderTable,
  tenantActiveModelTable,
} from "@/lib/db/schema";
import { decryptSecret } from "./crypto";
import { makeModel, platformKey } from "./adapters";

export interface ResolvedModel {
  model: LanguageModel;
  aiModelId: string; // ai_model.id (for usage logging)
  providerKey: string;
  modelString: string;
  priceInPer1m: number | null;
  priceOutPer1m: number | null;
  keySource: "tenant" | "platform";
}

/**
 * Resolve a tenant's one active model into a runnable Vercel AI SDK model (doc 24):
 * tenant_active_model → ai_model → ai_provider → credential (tenant BYOK, else
 * platform env key). Explicit tenant_id filters belt-and-suspender RLS. Returns
 * null when no active model or no usable key.
 */
export async function resolveActiveModel(ctx: TenantContext): Promise<ResolvedModel | null> {
  const row = await withTenant(ctx, async (tx) => {
    const active = await tx
      .select()
      .from(tenantActiveModelTable)
      .where(eq(tenantActiveModelTable.tenantId, ctx.tenantId))
      .limit(1);
    if (!active[0]) return null;

    const m = await tx.select().from(aiModelTable).where(eq(aiModelTable.id, active[0].modelId)).limit(1);
    if (!m[0]) return null;

    const p = await tx.select().from(aiProviderTable).where(eq(aiProviderTable.id, m[0].providerId)).limit(1);
    if (!p[0]) return null;

    const cred = await tx
      .select()
      .from(aiCredentialTable)
      .where(and(eq(aiCredentialTable.tenantId, ctx.tenantId), eq(aiCredentialTable.providerId, m[0].providerId)))
      .limit(1);

    return { m: m[0], p: p[0], cred: cred[0] ?? null };
  });
  if (!row) return null;

  let apiKey: string | undefined;
  let keySource: "tenant" | "platform";
  if (row.cred) {
    apiKey = decryptSecret(row.cred.apiKeyEnc);
    keySource = "tenant";
  } else {
    apiKey = platformKey(row.p.key);
    keySource = "platform";
  }
  if (!apiKey) return null; // neither BYOK nor platform key available

  return {
    model: makeModel(row.p.key, row.m.modelId, apiKey, row.p.baseUrl),
    aiModelId: row.m.id,
    providerKey: row.p.key,
    modelString: row.m.modelId,
    priceInPer1m: row.m.priceInPer1m ?? null,
    priceOutPer1m: row.m.priceOutPer1m ?? null,
    keySource,
  };
}
