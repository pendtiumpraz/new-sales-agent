// POST /api/draft-message — generate a per-segment WhatsApp opener.
//
// Wired by Agent F into the Enrichment AI Analysis panel
// (`components/pipeline/ai-analysis-panel.tsx`). The route prefers a real
// Deepseek call via the Vercel AI Gateway, but falls back to a
// template-style draft when credentials are missing or the LLM call errors
// so the demo never breaks.

import { NextResponse } from "next/server";
import { generateText } from "ai";

import {
  GATEWAY_MODEL_FAST,
  hasGatewayCredentials,
  isRealAiEnabled,
} from "@/lib/ai/provider";
import { buildKbSystemPrompt } from "@/lib/utils/kb-system-prompt";
import { formatIDR } from "@/lib/utils/format-idr";
import type { KnowledgeBase } from "@/lib/types/kb";

export const runtime = "nodejs";
export const maxDuration = 15;

interface DraftMessageBody {
  segment: "UMKM" | "Menengah" | "Enterprise";
  productName: string;
  productDescription: string;
  productPriceIDR: number;
  targetCompanySize?: string[];
  kbSnapshot: KnowledgeBase;
  regenerate?: boolean;
}

interface DraftMessageResponse {
  draft: string;
  source: "real" | "mock";
}

/**
 * Template-style fallback — mirrors the static draft in `ai-analysis-panel.tsx`
 * so the UI behaviour stays consistent when the LLM is offline.
 */
function templateDraft(body: DraftMessageBody): string {
  const sizeBand = body.targetCompanySize?.join(" / ") ?? "";
  return [
    `Halo Bapak/Ibu {nama},`,
    ``,
    `Kami melihat tim di {perusahaan} cocok dengan paket *${body.productName}* — disusun khusus untuk perusahaan skala ${body.segment}${sizeBand ? ` (${sizeBand} karyawan)` : ""}.`,
    ``,
    `${body.productDescription}`,
    ``,
    `Investasi mulai *${formatIDR(body.productPriceIDR)}*/bulan, dengan benefit:`,
    `• Onboarding 7 hari, didampingi tim sales kami`,
    `• Integrasi WhatsApp Business API + multi-channel`,
    `• Support lokal jam kerja WIB`,
    ``,
    `Boleh kami jadwalkan demo 20 menit minggu ini?`,
    ``,
    `Terima kasih,`,
    `Tim Agentic Sales`,
  ].join("\n");
}

function buildUserPrompt(body: DraftMessageBody): string {
  const sizeLine =
    body.targetCompanySize && body.targetCompanySize.length > 0
      ? body.targetCompanySize.join(", ")
      : "-";
  return [
    `Susun pesan WhatsApp pembuka untuk prospek segmen ${body.segment} (skala karyawan: ${sizeLine}).`,
    `Produk yang ditawarkan: ${body.productName} — ${body.productDescription}. Harga mulai Rp ${body.productPriceIDR}/bulan.`,
    ``,
    `Format: salam pembuka, ringkasan fit dengan profil prospek, 3 bullet benefit, harga & CTA jadwal demo, salam penutup.`,
    `Gunakan placeholder {nama} dan {perusahaan} untuk variabel.`,
    `Bahasa Indonesia, sopan, max 12 baris.`,
  ].join("\n");
}

export async function POST(req: Request) {
  let body: DraftMessageBody;
  try {
    body = (await req.json()) as DraftMessageBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body || !body.segment || !body.productName || !body.kbSnapshot) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  // Fall back to the template draft when real AI isn't wired up.
  if (!hasGatewayCredentials() || !isRealAiEnabled()) {
    const draft = templateDraft(body);
    const payload: DraftMessageResponse = { draft, source: "mock" };
    return NextResponse.json(payload);
  }

  try {
    const system = buildKbSystemPrompt(body.kbSnapshot, {
      surface: "analysis",
      segmentHint: body.segment,
    });
    const prompt = buildUserPrompt(body);

    const { text } = await generateText({
      model: GATEWAY_MODEL_FAST,
      system,
      prompt,
      temperature: body.regenerate ? 0.85 : 0.55,
      maxOutputTokens: 400,
    });

    const trimmed = (text ?? "").trim();
    if (!trimmed) {
      const draft = templateDraft(body);
      const payload: DraftMessageResponse = { draft, source: "mock" };
      return NextResponse.json(payload);
    }

    const payload: DraftMessageResponse = { draft: trimmed, source: "real" };
    return NextResponse.json(payload);
  } catch (err) {
    // Soft-fail to the template so the demo never breaks.
    console.error("[draft-message] LLM call failed:", err);
    const draft = templateDraft(body);
    const payload: DraftMessageResponse = { draft, source: "mock" };
    return NextResponse.json(payload);
  }
}
