// System Diagnostics — live AI Gateway ping.
//
// POST /api/diagnostics/ai-ping
// Actually CALLS Deepseek through the Vercel AI Gateway with a fixed
// lightweight prompt and reports the result. Lets the user click a button on
// the Settings → Diagnostics page to prove the live AI works end-to-end
// (separate from any KB-specific surface).
//
// Always returns HTTP 200 — even on error — so the UI can render the failure
// inline (status code, message, cause) instead of hitting a generic error
// boundary. The shape of the response distinguishes between the modes:
//   { ok: false, source: "mock"  }   — gates failed
//   { ok: true,  source: "real"  }   — Deepseek responded
//   { ok: false, source: "error" }   — Gateway/provider threw

import { NextResponse } from "next/server";
import { generateText } from "ai";

import {
  GATEWAY_MODEL_FAST,
  hasGatewayCredentials,
  isRealAiEnabled,
} from "@/lib/ai/provider";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST() {
  if (!hasGatewayCredentials() || !isRealAiEnabled()) {
    return NextResponse.json({
      ok: false,
      reason: !hasGatewayCredentials()
        ? "AI_GATEWAY_API_KEY tidak tersedia di runtime."
        : "NEXT_PUBLIC_AI_PROVIDER ≠ 'deepseek'.",
      source: "mock",
    });
  }

  const t0 = Date.now();
  try {
    const { text, usage } = await generateText({
      model: GATEWAY_MODEL_FAST,
      prompt:
        "Balas dalam satu kalimat: konfirmasi bahwa kamu Deepseek dan sebutkan tanggal hari ini.",
      temperature: 0.3,
      maxOutputTokens: 80,
    });

    return NextResponse.json({
      ok: true,
      source: "real",
      latencyMs: Date.now() - t0,
      response: text,
      usage: usage ?? null,
    });
  } catch (err: unknown) {
    const e = err as {
      message?: string;
      statusCode?: number;
      cause?: { message?: string };
    };
    return NextResponse.json(
      {
        ok: false,
        source: "error",
        latencyMs: Date.now() - t0,
        error: {
          message: e?.message ?? String(err),
          statusCode: e?.statusCode,
          causeMessage: e?.cause?.message,
        },
      },
      { status: 200 }, // 200 so the UI can render the error inline
    );
  }
}
