// Deepseek API provider configuration (direct, no Vercel AI Gateway).
//
// Routes consume the exported `MODEL_*` constants as LanguageModel objects.
// `GATEWAY_MODEL_*` aliases are kept so existing route handlers don't need to
// change — the constant name is misleading now but the value works the same.
//
// Why direct Deepseek?
// - You already have credits at platform.deepseek.com — no Vercel margin
// - Lower per-call latency (one less hop)
// - Same model lineup: deepseek-chat (V3) for chat/fast surfaces,
//   deepseek-reasoner (R1) for analysis tasks that benefit from CoT
//
// Setup:
// 1. Get an API key at https://platform.deepseek.com → API Keys
// 2. Set DEEPSEEK_API_KEY in Vercel (Settings → Environment Variables)
// 3. Set NEXT_PUBLIC_AI_PROVIDER=deepseek
// 4. Redeploy

import { deepseek } from "@ai-sdk/deepseek";

/** Chat surface — multi-turn assistant. DeepSeek V4 Pro (general-purpose). */
export const DEEPSEEK_MODEL_CHAT = deepseek("deepseek-v4-pro");

/** One-shot drafts + autopilot text — latency-sensitive. DeepSeek V4 Flash. */
export const DEEPSEEK_MODEL_FAST = deepseek("deepseek-v4-flash");

/** Analysis tasks — R1 reasoner for deep chain-of-thought. Slower (~5-15s) but
 *  better grounded for KB synthesis and per-segment insights. */
export const DEEPSEEK_MODEL_REASONING = deepseek("deepseek-reasoner");

// ── Backward-compat aliases ─────────────────────────────────────────────────
// The previous AI Gateway implementation exported these names. Routes still
// import them — keep the names so we don't have to touch every route handler.
export const GATEWAY_MODEL_CHAT = DEEPSEEK_MODEL_CHAT;
export const GATEWAY_MODEL_FAST = DEEPSEEK_MODEL_FAST;
export const GATEWAY_MODEL_REASONING = DEEPSEEK_MODEL_REASONING;

/**
 * Is the real Deepseek backend wired?
 *
 * Returns `false` when the offline KB heuristic mock (`composeKbReply`)
 * should be used instead. Safe in both client and server contexts because
 * it only reads a `NEXT_PUBLIC_*` variable.
 */
export function isRealAiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AI_PROVIDER === "deepseek";
}

/**
 * True when running server-side AND a Deepseek API key is available.
 *
 * Client-side always returns false because the key should never be shipped
 * to the browser.
 */
export function hasDeepseekKey(): boolean {
  if (typeof window !== "undefined") return false;
  if (typeof process === "undefined" || !process.env) return false;
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/** Backward-compat alias — old name still imported by routes. */
export const hasGatewayCredentials = hasDeepseekKey;
