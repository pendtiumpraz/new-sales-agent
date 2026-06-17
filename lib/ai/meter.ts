import { generateText, streamText, type ModelMessage } from "ai";

import { withTenant, type TenantContext } from "@/lib/db/tenant-context";
import { aiUsageTable } from "@/lib/db/schema";
import { isTenantActive } from "@/lib/admin/kill-switch";
import { creditEnforced, tenantCreditBalance } from "@/lib/billing/credit";
import { resolveActiveModel } from "./registry";

/** Block when credit enforcement is on and the tenant's balance is exhausted. */
async function assertCredit(ctx: TenantContext) {
  if (!creditEnforced()) return;
  const bal = await tenantCreditBalance(ctx);
  if (bal.balance <= 0) {
    throw new Error("Kredit AI habis — minta superadmin untuk top-up");
  }
}

/** Compute cost (USD) from token counts + the model's snapshotted per-1M pricing. */
function costOf(
  resolved: { priceInPer1m?: number | null; priceOutPer1m?: number | null },
  tokensIn: number,
  tokensOut: number,
): number {
  return (
    (tokensIn / 1_000_000) * (resolved.priceInPer1m ?? 0) +
    (tokensOut / 1_000_000) * (resolved.priceOutPer1m ?? 0)
  );
}

interface MeterOpts {
  feature: string; // chat | draft | autopilot | …
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  maxOutputTokens?: number;
  // NB: no temperature — sampling params 400 on Anthropic Opus 4.7/4.8, and the
  // registry is provider-agnostic, so we let the model default.
}

/**
 * Run the tenant's active model and record token usage + cost to ai_usage
 * (doc 24). Every metered AI call flows through here so nothing escapes the
 * meter. Cost is computed from the model's snapshotted per-1M pricing.
 */
export async function meteredGenerateText(ctx: TenantContext, opts: MeterOpts) {
  if (!(await isTenantActive(ctx))) {
    throw new Error("Tenant suspended (kill-switch) — AI disabled");
  }
  await assertCredit(ctx);
  const resolved = await resolveActiveModel(ctx);
  if (!resolved) {
    throw new Error("No active AI model or usable key for this tenant (configure in Settings → AI)");
  }

  // Reasoning models (deepseek-v4-flash/pro, *-reasoner, *-r1, *-thinking) spend
  // output tokens on hidden reasoning BEFORE emitting content — a small
  // maxOutputTokens is consumed entirely by reasoning and returns EMPTY text
  // (e.g. enrich's 140/220-token budgets → blank summaries/industry). Floor the
  // budget for these so short calls still yield a real answer. Non-reasoning
  // models (deepseek-chat, gpt, …) keep the caller's exact budget.
  const isReasoning = /v4-flash|v4-pro|reasoner|reasoning|[-_]r1\b|think/i.test(resolved.modelString);
  const maxOutputTokens = isReasoning ? Math.max(opts.maxOutputTokens ?? 0, 1200) : opts.maxOutputTokens;

  const start = Date.now();
  // generateText's prompt is a discriminated union ({prompt} | {messages}) — pass
  // exactly one, never `messages: undefined`, or the overload fails to resolve.
  const base = {
    model: resolved.model,
    system: opts.system,
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
  };
  const result = await generateText(
    opts.messages
      ? { ...base, messages: opts.messages }
      : { ...base, prompt: opts.prompt ?? "" },
  );
  const latencyMs = Date.now() - start;

  // ai v6 usage: { inputTokens, outputTokens }. Tolerate older field names.
  const u = (result.usage ?? {}) as unknown as Record<string, number | undefined>;
  const tokensIn = u.inputTokens ?? u.promptTokens ?? 0;
  const tokensOut = u.outputTokens ?? u.completionTokens ?? 0;
  const cost = costOf(resolved, tokensIn, tokensOut);

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

interface MeterStreamOpts {
  feature: string;
  system?: string;
  messages: ModelMessage[];
  // NB: no temperature — sampling params 400 on Anthropic Opus, and the
  // registry is provider-agnostic, so we let the model default.
}

/**
 * Streaming sibling of meteredGenerateText (doc 24). Resolves the tenant's
 * active model and returns the streamText result so the caller can pipe it
 * straight to the client (e.g. `result.toUIMessageStreamResponse()`); token
 * usage + cost are recorded to ai_usage in `onFinish` once the stream
 * completes. The usage write is wrapped so it can never break the stream.
 *
 * Throws synchronously (before any streaming) when the tenant is suspended or
 * has no usable model — callers catch this to fall back gracefully.
 */
export async function meteredStreamText(ctx: TenantContext, opts: MeterStreamOpts) {
  if (!(await isTenantActive(ctx))) {
    throw new Error("Tenant suspended (kill-switch) — AI disabled");
  }
  const resolved = await resolveActiveModel(ctx);
  if (!resolved) {
    throw new Error("No active AI model or usable key for this tenant (configure in Settings → AI)");
  }

  const start = Date.now();
  return streamText({
    model: resolved.model,
    system: opts.system,
    messages: opts.messages,
    onFinish: async (event) => {
      try {
        const u = (event.usage ?? {}) as unknown as Record<string, number | undefined>;
        const tokensIn = u.inputTokens ?? u.promptTokens ?? 0;
        const tokensOut = u.outputTokens ?? u.completionTokens ?? 0;
        await withTenant(ctx, (tx) =>
          tx.insert(aiUsageTable).values({
            id: "use_" + crypto.randomUUID(),
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            modelId: resolved.aiModelId,
            feature: opts.feature,
            tokensIn,
            tokensOut,
            cost: costOf(resolved, tokensIn, tokensOut),
            latencyMs: Date.now() - start,
          }),
        );
      } catch (err) {
        console.error("[meter] stream usage record failed:", err);
      }
    },
  });
}
