// Vercel AI Gateway provider configuration for Deepseek models.
//
// This is the foundation contract consumed by Agents B–E. The signatures here
// are STABLE — sibling agents wire chat / auto-reply / analysis surfaces
// against the constants and helpers below. Do not rename without coordination.
//
// Why the Gateway?
// - One key gives access to Deepseek + 100+ models (`vercel env pull`).
// - Built-in observability + cost tracking in the Vercel dashboard.
// - In production, OIDC tokens are auto-issued — no API key needs to be set.

/** Model used for assistant conversations (multi-turn chat surface). */
export const GATEWAY_MODEL_CHAT = "deepseek/deepseek-v4-pro";

/** Model used for one-shot drafts and auto-reply suggestions (latency-sensitive). */
export const GATEWAY_MODEL_FAST = "deepseek/deepseek-v4-flash";

/** Model used for analysis tasks — segment insights, deal coaching, RAG synthesis. */
export const GATEWAY_MODEL_REASONING = "deepseek/deepseek-v3.2-thinking";

/**
 * Is the real Deepseek backend wired?
 *
 * Returns `false` when the offline KB heuristic mock (`composeKbReply`)
 * should be used instead. Safe in both client and server contexts because
 * it only reads a `NEXT_PUBLIC_*` variable.
 */
export function isRealAiEnabled(): boolean {
  // `NEXT_PUBLIC_*` vars are inlined at build time and available everywhere.
  return process.env.NEXT_PUBLIC_AI_PROVIDER === "deepseek";
}

/**
 * True when running server-side AND a Gateway credential is available.
 *
 * The Vercel AI Gateway accepts either:
 *  - `AI_GATEWAY_API_KEY` — manual key pulled from the dashboard (dev), OR
 *  - `VERCEL_OIDC_TOKEN`  — auto-issued in Vercel runtimes (prod / preview).
 *
 * Client-side always returns false because neither credential should ever be
 * shipped to the browser.
 */
export function hasGatewayCredentials(): boolean {
  if (typeof window !== "undefined") return false;
  if (typeof process === "undefined" || !process.env) return false;
  const hasKey = Boolean(process.env.AI_GATEWAY_API_KEY);
  const hasOidc = Boolean(process.env.VERCEL_OIDC_TOKEN);
  return hasKey || hasOidc;
}
