// Auto-reply draft endpoint for the inbox composer card.
//
// One-shot text generation (no streaming) wired to the Vercel AI Gateway,
// using the fast Deepseek flash model for low-latency suggestions. When the
// Gateway is not configured, falls back to the offline KB heuristic so the
// demo continues to work in any environment.
//
// Contract (consumed by `components/inbox/auto-reply-card.tsx`):
//   POST {
//     conversationContext: string;
//     contactName?: string;
//     company?: string;
//     kbSnapshot: KnowledgeBase;
//   } -> { draft: string; source: "real" | "mock" }

import { NextResponse } from "next/server";
import { generateText } from "ai";

import {
  GATEWAY_MODEL_FAST,
  hasGatewayCredentials,
  isRealAiEnabled,
} from "@/lib/ai/provider";
import { hasDb } from "@/lib/db/client";
import { getTenantContext } from "@/lib/auth/session-context";
import { meteredGenerateText } from "@/lib/ai/meter";
import { stripMarkdown } from "@/lib/ai/sanitize";
import { wrapUntrusted, looksInjected } from "@/lib/ai/safety";
import { composeKbReply } from "@/lib/utils/compose-kb-reply";
import { buildKbSystemPrompt } from "@/lib/utils/kb-system-prompt";
import type { KnowledgeBase } from "@/lib/types/kb";

export const runtime = "nodejs";
export const maxDuration = 15;

interface AutoReplyRequest {
  conversationContext: string;
  contactName?: string;
  company?: string;
  kbSnapshot: KnowledgeBase;
}

// Extract the last inbound message from the serialized conversation context
// so the KB heuristic mock has something concrete to score against.
function extractLastUserMessage(context: string): string {
  if (!context) return "";
  const lines = context
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  // Prefer the last line that does NOT look like an outbound/agent message.
  // We accept any of: "Pelanggan:", "Kontak:", "Mereka:", "Customer:" prefixes.
  const isInbound = (l: string) =>
    /^(pelanggan|kontak|mereka|customer|user|prospek|client)\s*[:\-]/i.test(l);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isInbound(lines[i])) return lines[i].replace(/^[^:\-]+[:\-]\s*/, "");
  }
  // Otherwise just take the last line as best effort.
  return lines[lines.length - 1] ?? context;
}

function buildMockDraft(body: AutoReplyRequest): string {
  const seed = extractLastUserMessage(body.conversationContext);
  return composeKbReply(seed, body.kbSnapshot).body;
}

export async function POST(request: Request) {
  let body: AutoReplyRequest;
  try {
    body = (await request.json()) as AutoReplyRequest;
  } catch {
    return NextResponse.json(
      { error: "Body harus berupa JSON yang valid." },
      { status: 400 },
    );
  }

  if (!body || typeof body.conversationContext !== "string" || !body.kbSnapshot) {
    return NextResponse.json(
      { error: "conversationContext dan kbSnapshot wajib diisi." },
      { status: 400 },
    );
  }

  // doc 43 §2/§3.4 — the inbound conversation is untrusted; a hijack attempt
  // degrades to the KB heuristic instead of being fed to the model.
  if (looksInjected(body.conversationContext)) {
    return NextResponse.json({ draft: stripMarkdown(buildMockDraft(body)), source: "mock" as const });
  }
  const system = buildKbSystemPrompt(body.kbSnapshot, { surface: "auto-reply" });
  const prompt =
    `Tulis balasan WhatsApp singkat (max 3 paragraf) untuk percakapan berikut:\n\n${wrapUntrusted("percakapan", body.conversationContext)}\n\n` +
    "Gunakan Basis Pengetahuan di atas. Sopan, akurat, Bahasa Indonesia.";

  // Prefer the per-tenant AI registry (metered; tenant BYOK or platform key)
  // when logged in and the DB is wired. (Fase 3, doc 24)
  const ctx = await getTenantContext();
  if (ctx && hasDb()) {
    try {
      const { text } = await meteredGenerateText(ctx, {
        feature: "auto-reply",
        system,
        prompt,
        maxOutputTokens: 400,
      });
      const trimmed = stripMarkdown((text ?? "").trim()); // doc 43 §1 — sent to client over WA/email
      if (trimmed) {
        return NextResponse.json({ draft: trimmed, source: "real" as const });
      }
    } catch (err) {
      console.error("[auto-reply] registry call failed, trying gateway/mock:", err);
    }
  }

  // Legacy Gateway fallback — only when no per-tenant model resolved.
  if (!hasGatewayCredentials() || !isRealAiEnabled()) {
    return NextResponse.json({
      draft: buildMockDraft(body),
      source: "mock" as const,
    });
  }

  try {
    // NOTE: AI SDK v6 uses `maxOutputTokens` (verified against
    // node_modules/ai/dist/index.d.ts → CallSettings). The model string is
    // resolved via the Vercel AI Gateway when AI_GATEWAY_API_KEY or
    // VERCEL_OIDC_TOKEN is present in the runtime env.
    const result = await generateText({
      model: GATEWAY_MODEL_FAST,
      system,
      prompt,
      temperature: 0.6,
      maxOutputTokens: 400,
    });

    const draft = stripMarkdown((result.text ?? "").trim()); // doc 43 §1
    if (!draft) {
      // Empty completion — fall back rather than show nothing.
      return NextResponse.json({
        draft: buildMockDraft(body),
        source: "mock" as const,
      });
    }

    return NextResponse.json({
      draft,
      source: "real" as const,
    });
  } catch (error) {
    // Any provider/gateway error — degrade gracefully to the KB heuristic.
    console.error("[auto-reply] Deepseek call failed, falling back:", error);
    return NextResponse.json({
      draft: buildMockDraft(body),
      source: "mock" as const,
    });
  }
}
