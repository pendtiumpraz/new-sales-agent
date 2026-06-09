// System Diagnostics — safe status endpoint.
//
// GET /api/diagnostics
// Returns a runtime status snapshot used by the Settings → Diagnostics page so
// the user can verify, in the live deployed app, whether the Deepseek API key
// and Postgres credentials are present and what the runtime environment looks
// like. NEVER returns secret values — only booleans, model identifiers, and
// env-var KEY NAMES (so we can prove Vercel injected the expected prefixes).

import { NextResponse } from "next/server";

import { hasDeepseekKey, isRealAiEnabled } from "@/lib/ai/provider";
import { hasDb } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ai: {
      // Field name preserved for the existing UI consumer — actually checks the
      // direct Deepseek API key now (no Vercel AI Gateway).
      gatewayCredentialPresent: hasDeepseekKey(),
      realAiFlagOn: isRealAiEnabled(),
      // Hardcoded labels — model objects from @ai-sdk/deepseek aren't string-
      // serialisable, and the UI only needs human-readable model names.
      modelChat: "deepseek-chat (V3)",
      modelFast: "deepseek-chat (V3)",
      modelReasoning: "deepseek-reasoner (R1)",
      provider: "Deepseek Direct API",
      // True only when both gates pass — what the routes actually use to
      // decide "real" vs "mock".
      ready: hasDeepseekKey() && isRealAiEnabled(),
    },
    db: {
      credentialPresent: hasDb(),
      // List env var KEY NAMES that match POSTGRES (no values).
      detectedKeys: Object.keys(process.env)
        .filter((k) => /_?POSTGRES_/.test(k))
        .sort(),
    },
    runtime: {
      node: process.version,
      env: process.env.VERCEL_ENV ?? "local", // production | preview | development
      region: process.env.VERCEL_REGION ?? "local",
    },
  });
}
