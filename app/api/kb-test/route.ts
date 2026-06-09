// KB AI Test route — POST a free-form prompt + a snapshot of the live
// Knowledge Base and get back a Bahasa Indonesia answer.
//
// Two execution modes:
//  1. "real" — when the Vercel AI Gateway has a credential available
//     (`AI_GATEWAY_API_KEY` locally, `VERCEL_OIDC_TOKEN` on Vercel) AND the
//     `NEXT_PUBLIC_AI_PROVIDER=deepseek` toggle is set. We call Deepseek via
//     the Gateway using a KB-pinned system prompt.
//  2. "mock" — when either of the above is missing, OR the live call throws.
//     Falls back to the deterministic `composeKbReply` heuristic so the demo
//     never breaks.
//
// We deliberately use `GATEWAY_MODEL_FAST` (deepseek-v4-flash) rather than the
// reasoning model: the KB Test panel is an interactive playground, so snappy
// sub-2s responses matter more than chain-of-thought depth here.

import { NextResponse } from "next/server";
import { generateText } from "ai";

import {
  GATEWAY_MODEL_FAST,
  hasGatewayCredentials,
  isRealAiEnabled,
} from "@/lib/ai/provider";
import { composeKbReply } from "@/lib/utils/compose-kb-reply";
import {
  buildKbSystemPrompt,
  retrieveSources,
} from "@/lib/utils/kb-system-prompt";
import type { KnowledgeBase } from "@/lib/types/kb";

export const runtime = "nodejs";
export const maxDuration = 20;

interface KbTestRequest {
  prompt: string;
  kbSnapshot: KnowledgeBase;
}

interface KbTestResponse {
  answer: string;
  sources: string[];
  source: "real" | "mock";
}

function mockResponse(prompt: string, kb: KnowledgeBase): KbTestResponse {
  const reply = composeKbReply(prompt, kb);
  return {
    answer: reply.body,
    sources: reply.sources,
    source: "mock",
  };
}

export async function POST(req: Request) {
  let body: KbTestRequest;
  try {
    body = (await req.json()) as KbTestRequest;
  } catch {
    return NextResponse.json(
      { error: "Body JSON tidak valid." },
      { status: 400 },
    );
  }

  const prompt = (body?.prompt ?? "").trim();
  const kb = body?.kbSnapshot;

  if (!prompt || !kb) {
    return NextResponse.json(
      { error: "Field `prompt` dan `kbSnapshot` wajib diisi." },
      { status: 400 },
    );
  }

  // No credentials or feature flag off → deterministic heuristic.
  if (!hasGatewayCredentials() || !isRealAiEnabled()) {
    return NextResponse.json(mockResponse(prompt, kb));
  }

  try {
    const system = buildKbSystemPrompt(kb, {
      surface: "analysis",
      includeSources: true,
      userPrompt: prompt,
    });

    const { text } = await generateText({
      model: GATEWAY_MODEL_FAST,
      system,
      prompt,
      temperature: 0.3,
    });

    const sources = retrieveSources(prompt, kb).map((s) => s.title);

    const payload: KbTestResponse = {
      answer: text.trim(),
      sources,
      source: "real",
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[kb-test] real AI call failed — falling back to mock", err);
    return NextResponse.json(mockResponse(prompt, kb));
  }
}
