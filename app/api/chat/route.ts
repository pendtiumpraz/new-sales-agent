// Streaming chat endpoint for the global AI assistant sheet.
//
// POST body: { messages: UIMessage[], kbSnapshot: KnowledgeBase }
//
// Two execution modes (mirrors the other AI routes):
//   1. "real" — when the Vercel AI Gateway has a credential available
//      (`AI_GATEWAY_API_KEY` locally or `VERCEL_OIDC_TOKEN` on Vercel) AND the
//      `NEXT_PUBLIC_AI_PROVIDER=deepseek` toggle is set. We stream Deepseek
//      v4-pro via `streamText` and return the UI-message stream so the
//      `@ai-sdk/react` `useChat` hook can consume it directly.
//   2. "mock" — when either of the above is missing, OR the real call throws.
//      Falls back to the deterministic `composeKbReply` heuristic, packaged as
//      a one-shot UI-message stream (start → text-start → text-delta → text-end
//      → finish) so the same client transport works in both modes.
//
// The client reads the `x-ai-source` header to label the response as real or
// mock in the UI. `Access-Control-Expose-Headers` ensures fetch can see it.

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";

import {
  GATEWAY_MODEL_CHAT,
  hasGatewayCredentials,
  isRealAiEnabled,
} from "@/lib/ai/provider";
import { hasDb } from "@/lib/db/client";
import { getTenantContext } from "@/lib/auth/session-context";
import { meteredStreamText } from "@/lib/ai/meter";
import { estimateTokens, messagesToTranscript, selectChatContext } from "@/lib/ai/chat-context";
import { summarizeConversation } from "@/lib/ai/summarize-conversation";
import { buildKbSystemPrompt } from "@/lib/utils/kb-system-prompt";
import { composeKbReply } from "@/lib/utils/compose-kb-reply";
import type { KnowledgeBase } from "@/lib/types/kb";

// Fluid Compute supports the full Node.js runtime — required so the AI
// Gateway client can read `VERCEL_OIDC_TOKEN` from the runtime env.
export const runtime = "nodejs";
export const maxDuration = 30;

interface ChatRequestBody {
  messages: UIMessage[];
  kbSnapshot: KnowledgeBase;
}

// Pull the last user message's concatenated text out of the UI-message parts
// array. AI SDK v6 stores text on `parts[]` (TextUIPart) — the legacy
// `content` field is no longer guaranteed to be present.
function extractLastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const text = (m.parts ?? [])
      .filter((p): p is { type: "text"; text: string } => p?.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

// Common response headers — surfaces the AI source to the browser client and
// exposes it through CORS so `useChat`'s fetch can read it.
function headersFor(source: "real" | "mock"): HeadersInit {
  return {
    "x-ai-source": source,
    "Access-Control-Expose-Headers": "x-ai-source",
  };
}

// Build a one-shot UI-message stream that emits `composeKbReply` output as a
// single text part. Uses the exact chunk schema from
// node_modules/ai/dist/index.d.ts (UIMessageChunk):
//   start → text-start → text-delta → text-end → finish.
function buildMockUiMessageStream(
  prompt: string,
  kb: KnowledgeBase,
): ReadableStream {
  const draft = composeKbReply(prompt, kb).body;
  return createUIMessageStream({
    execute: ({ writer }) => {
      const textId = `mock-${Date.now()}`;
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: draft });
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });
}

function mockResponse(prompt: string, kb: KnowledgeBase): Response {
  return createUIMessageStreamResponse({
    stream: buildMockUiMessageStream(prompt, kb),
    headers: headersFor("mock"),
  });
}

export async function POST(request: Request) {
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return new Response(
      JSON.stringify({ error: "Body harus berupa JSON yang valid." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const kb = body?.kbSnapshot;
  if (messages.length === 0 || !kb) {
    return new Response(
      JSON.stringify({ error: "Field `messages` dan `kbSnapshot` wajib diisi." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const lastUserText = extractLastUserText(messages);

  const baseSystem = buildKbSystemPrompt(kb, {
    surface: "chat",
    includeSources: true,
    userPrompt: lastUserText,
  });

  const ctx = await getTenantContext();

  // Token-thrifty context: once the transcript outgrows a running summary, carry
  // the summary (+ recent turns verbatim) instead of the whole history.
  // selectChatContext makes the final shorter-of-the-two call. Only attempt when
  // metered AI is wired (the summary itself costs a call) and the chat is long
  // enough to be worth compressing.
  const KEEP_RECENT = 4;
  let contextMessages = messages;
  let system = baseSystem;
  if (
    ctx &&
    hasDb() &&
    messages.length > KEEP_RECENT + 1 &&
    estimateTokens(messagesToTranscript(messages)) > 600
  ) {
    const summary = await summarizeConversation(ctx, messages, KEEP_RECENT);
    const picked = selectChatContext({ messages, summary, keepRecent: KEEP_RECENT });
    contextMessages = picked.messages;
    if (picked.summaryNote) {
      system = `${baseSystem}\n\n## Ringkasan percakapan sebelumnya\n${picked.summaryNote}`;
    }
  }

  // Prefer the per-tenant AI registry (metered; tenant BYOK or platform key)
  // when logged in + DB wired — streamed, with usage recorded on finish. (doc 24)
  if (ctx && hasDb()) {
    try {
      const modelMessages = await convertToModelMessages(contextMessages);
      const result = await meteredStreamText(ctx, {
        feature: "chat",
        system,
        messages: modelMessages,
        maxOutputTokens: 800, // C1 — cap output (reasoning models floored to 1200)
      });
      return result.toUIMessageStreamResponse({ headers: headersFor("real") });
    } catch (error) {
      // No active model / suspended / setup error — fall through to the legacy
      // Gateway stream, then the deterministic mock.
      console.error("[chat] registry stream failed, trying gateway/mock:", error);
    }
  }

  // Legacy Gateway fallback — only when no per-tenant model resolved.
  if (!hasGatewayCredentials() || !isRealAiEnabled()) {
    return mockResponse(lastUserText, kb);
  }

  try {
    // AI SDK v6: `convertToModelMessages` is async (returns Promise<ModelMessage[]>),
    // so we await it before handing the array to `streamText`.
    const modelMessages = await convertToModelMessages(contextMessages);

    const result = streamText({
      model: GATEWAY_MODEL_CHAT,
      system,
      messages: modelMessages,
      temperature: 0.4,
      maxOutputTokens: 1200, // C1 — cap output (legacy fallback path)
    });

    return result.toUIMessageStreamResponse({
      headers: headersFor("real"),
    });
  } catch (error) {
    console.error("[chat] Deepseek call failed, falling back to mock:", error);
    return mockResponse(lastUserText, kb);
  }
}
