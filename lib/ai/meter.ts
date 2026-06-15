import { generateText, type ModelMessage } from "ai";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { aiUsageTable } from "@/lib/db/schema";
import { resolveActiveModel } from "./registry";

interface MeterOpts {
  feature: string; // chat | draft | autopilot | …
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
}

/**
 * Run the tenant's active model and record token usage + cost to ai_usage
 * (doc 24). Every metered AI call flows through here so nothing escapes the
 * meter. Cost is computed from the model's snapshotted per-1M pricing.
 */
export async function meteredGenerateText(ctx: TenantContext, opts: MeterOpts) {
  const resolved = await resolveActiveModel(ctx);
  if (!resolved) {
    throw new Error("No active AI model or usable key for this tenant (configure in Settings → AI)");
  }

  const start = Date.now();
  const result = await generateText({
    model: resolved.model,
    system: opts.system,
    prompt: opts.prompt,
    messages: opts.messages,
  });
  const latencyMs = Date.now() - start;

  // ai v6 usage: { inputTokens, outputTokens }. Tolerate older field names.
  const u = (result.usage ?? {}) as Record<string, number | undefined>;
  const tokensIn = u.inputTokens ?? u.promptTokens ?? 0;
  const tokensOut = u.outputTokens ?? u.completionTokens ?? 0;
  const cost =
    (tokensIn / 1_000_000) * (resolved.priceInPer1m ?? 0) +
    (tokensOut / 1_000_000) * (resolved.priceOutPer1m ?? 0);

  await withTenant(ctx, (tx) =>
    tx.insert(aiUsageTable).values({
      id: "use_" + crypto.randomUUID(),
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      modelId: resolved.aiModelId,
      feature: opts.feature,
      tokensIn,
      tokensOut,
      cost,
      latencyMs,
    }),
  );

  return {
    text: result.text,
    model: resolved.modelString,
    keySource: resolved.keySource,
    usage: { tokensIn, tokensOut, cost },
  };
}
