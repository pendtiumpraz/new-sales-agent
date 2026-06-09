// System Diagnostics — safe status endpoint.
//
// GET /api/diagnostics
// Returns a runtime status snapshot used by the Settings → Diagnostics page so
// the user can verify, in the live deployed app, whether the AI Gateway and
// Postgres credentials are present and what the runtime environment looks
// like. NEVER returns secret values — only booleans, model identifiers, and
// env-var KEY NAMES (so we can prove Vercel injected the expected prefixes).

import { NextResponse } from "next/server";

import {
  GATEWAY_MODEL_CHAT,
  GATEWAY_MODEL_FAST,
  hasGatewayCredentials,
  isRealAiEnabled,
} from "@/lib/ai/provider";
import { hasDb } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ai: {
      gatewayCredentialPresent: hasGatewayCredentials(),
      realAiFlagOn: isRealAiEnabled(),
      modelChat: GATEWAY_MODEL_CHAT,
      modelFast: GATEWAY_MODEL_FAST,
      // True only when both gates pass — what the routes actually use to
      // decide "real" vs "mock".
      ready: hasGatewayCredentials() && isRealAiEnabled(),
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
