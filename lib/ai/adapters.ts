import { createDeepSeek } from "@ai-sdk/deepseek";
import { createAnthropic } from "@ai-sdk/anthropic";

import type { LanguageModel } from "ai";

// Map a provider key + model string + API key to a Vercel AI SDK model (doc 24).
// Add a case (and `npm i @ai-sdk/<provider>`) to support more providers.
export function makeModel(
  providerKey: string,
  modelId: string,
  apiKey: string,
  baseUrl?: string | null,
): LanguageModel {
  switch (providerKey) {
    case "deepseek":
      return createDeepSeek({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) })(modelId);
    default:
      throw new Error(`No AI adapter for provider '${providerKey}' — install @ai-sdk/${providerKey} and add a case`);
  }
}

// Platform (env) key per provider — fallback when a tenant has no BYOK key.
export function platformKey(providerKey: string): string | undefined {
  switch (providerKey) {
    case "deepseek":
      return process.env.DEEPSEEK_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "google":
      return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    default:
      return undefined;
  }
}
