// Autopilot text-generation endpoint — unified POST surface for every content
// step the autopilot orchestrator (Agent D) needs to draft.
//
// One-shot text generation (no streaming) wired to the Vercel AI Gateway,
// using the fast Deepseek flash model because latency matters when the
// orchestrator chains multiple steps. When the Gateway is not configured (or
// the real provider toggle is off), falls back to deterministic Bahasa
// Indonesia templates so the demo stays coherent in any environment.
//
// Contract (consumed by lib/autopilot/* orchestrator):
//   POST {
//     kind: "linkedin-note" | "intro-dm" | "meeting-agenda" | "cos-summary";
//     prospect: { name, company, title?, segment?, industry?, city? };
//     kbSnapshot: KnowledgeBase;
//     meetingContext?: string;   // serialized transcript snippet (cos-summary)
//     goal?: "book-meeting" | "build-relationship" | "qualify";
//   } -> { text: string; source: "real" | "mock" }

import { NextResponse } from "next/server";
import { generateText } from "ai";

import {
  GATEWAY_MODEL_FAST,
  hasGatewayCredentials,
  isRealAiEnabled,
} from "@/lib/ai/provider";
import { buildKbSystemPrompt } from "@/lib/utils/kb-system-prompt";
import type { KnowledgeBase } from "@/lib/types/kb";

// Fluid Compute / Node.js runtime so the AI Gateway client can read
// VERCEL_OIDC_TOKEN from the runtime env.
export const runtime = "nodejs";
export const maxDuration = 20;

// ── Request / response shapes ───────────────────────────────────────────────

export type AutopilotTextKind =
  | "linkedin-note"
  | "intro-dm"
  | "meeting-agenda"
  | "cos-summary";

export type AutopilotGoal = "book-meeting" | "build-relationship" | "qualify";

export interface AutopilotProspect {
  name: string;
  company: string;
  title?: string;
  segment?: "UMKM" | "Menengah" | "Korporat";
  industry?: string;
  city?: string;
}

interface AutopilotTextRequest {
  kind: AutopilotTextKind;
  prospect: AutopilotProspect;
  kbSnapshot: KnowledgeBase;
  meetingContext?: string;
  goal?: AutopilotGoal;
}

interface AutopilotTextResponse {
  text: string;
  source: "real" | "mock";
}

// ── Per-kind prompt assembly ────────────────────────────────────────────────

interface PromptSpec {
  surface: "auto-reply" | "analysis";
  user: string;
  temperature: number;
  maxOutputTokens: number;
}

function goalLabel(goal: AutopilotGoal | undefined): string {
  if (!goal) return "membangun relasi";
  switch (goal) {
    case "book-meeting":
      return "menjadwalkan meeting";
    case "build-relationship":
      return "membangun relasi";
    case "qualify":
      return "kualifikasi kebutuhan";
  }
}

function titleClause(p: AutopilotProspect): string {
  return p.title ? `${p.title} di ${p.company}` : p.company;
}

function segmentLabel(p: AutopilotProspect): string {
  return p.segment ?? "tidak diketahui";
}

function buildPromptSpec(body: AutopilotTextRequest): PromptSpec {
  const { kind, prospect, meetingContext, goal } = body;
  const titlePart = titleClause(prospect);
  const segment = segmentLabel(prospect);

  switch (kind) {
    case "linkedin-note": {
      return {
        surface: "auto-reply",
        user:
          `Tulis catatan koneksi LinkedIn pendek (maks 300 karakter) untuk ${prospect.name} (${titlePart}). ` +
          `Sebutkan satu alasan spesifik mengapa Anda ingin terhubung — boleh referensi industri/segmennya. ` +
          `Bahasa Indonesia, ramah, profesional, tanpa pitch jualan.`,
        temperature: 0.6,
        maxOutputTokens: 200,
      };
    }
    case "intro-dm": {
      return {
        surface: "auto-reply",
        user:
          `Tulis pesan DM intro untuk ${prospect.name} (${titlePart}, segmen ${segment}). ` +
          `Bahasa Indonesia. Struktur: (1) terima kasih sudah terkoneksi, ` +
          `(2) satu insight relevan dari Basis Pengetahuan untuk segmennya, ` +
          `(3) ajakan ngobrol 15 menit. Sopan, tidak hard-sell, maks 3 paragraf.`,
        temperature: 0.7,
        maxOutputTokens: 400,
      };
    }
    case "meeting-agenda": {
      return {
        surface: "auto-reply",
        user:
          `Susun usulan meeting untuk ${prospect.name} (${prospect.company}). ` +
          `Format: 1 kalimat pengantar + 3 bullet agenda spesifik untuk segmen ${segment} ` +
          `dengan goal ${goalLabel(goal)}. Bahasa Indonesia, ringkas, langsung pada poin.`,
        temperature: 0.5,
        maxOutputTokens: 300,
      };
    }
    case "cos-summary": {
      const contextTail = meetingContext
        ? `Konteks transkrip: ${meetingContext}`
        : "Asumsikan meeting berjalan positif, prospek tertarik produk inti.";
      return {
        surface: "analysis",
        user:
          `Ringkas hasil meeting dengan ${prospect.name} (${prospect.company}) dalam format: ` +
          `(1) Topik dibahas — 2-3 bullet, (2) Komitmen dari prospek, ` +
          `(3) Tindak lanjut (siapa kerjakan apa kapan), ` +
          `(4) Status pipeline yang disarankan (prospek/kualifikasi/penawaran/negosiasi/tutup). ` +
          `Bahasa Indonesia, ringkas, struktur jelas dengan heading. ${contextTail}`,
        temperature: 0.4,
        maxOutputTokens: 500,
      };
    }
  }
}

// ── Mock fallback templates ─────────────────────────────────────────────────
//
// Deterministic per-kind Bahasa Indonesia drafts that still reference the
// prospect + a real KB product name so the demo stays coherent without a live
// Gateway credential.

function pickKbProductName(kb: KnowledgeBase): string {
  const active = kb.products.find((p) => p.active);
  return active?.name ?? kb.products[0]?.name ?? "produk inti kami";
}

function buildMockText(body: AutopilotTextRequest): string {
  const { kind, prospect, goal } = body;
  const productName = pickKbProductName(body.kbSnapshot);
  const titlePart = titleClause(prospect);
  const segment = prospect.segment ?? "Menengah";
  const industryPart = prospect.industry ? ` di industri ${prospect.industry}` : "";

  switch (kind) {
    case "linkedin-note": {
      // Keep well under LinkedIn's 300-char limit.
      const note =
        `Halo ${prospect.name}, saya tertarik dengan kerja ${prospect.company}${industryPart}. ` +
        `Ingin terhubung untuk berbagi insight seputar ${productName}. Terima kasih!`;
      return note.length > 300 ? note.slice(0, 297) + "..." : note;
    }

    case "intro-dm": {
      return [
        `Halo ${prospect.name}, terima kasih sudah menerima koneksi — senang bisa terhubung dengan ${titlePart}.`,
        `Untuk segmen ${segment}, kami sering membantu tim sales mengelola pipeline lebih rapi lewat ${productName}, sehingga follow-up tidak ada yang lolos dan tim fokus pada lead bernilai tinggi.`,
        `Kalau berkenan, boleh saya minta waktu 15 menit minggu depan untuk diskusi singkat? Jadwal saya fleksibel, tinggal sesuaikan dengan ${prospect.name}.`,
      ].join("\n\n");
    }

    case "meeting-agenda": {
      const goalText = goalLabel(goal);
      return [
        `Berikut usulan agenda meeting singkat dengan ${prospect.name} dari ${prospect.company} — fokus pada ${goalText} untuk segmen ${segment}.`,
        `- Pemetaan kebutuhan sales & tantangan utama tim ${prospect.company} saat ini`,
        `- Bagaimana ${productName} bisa dipakai harian oleh tim segmen ${segment}`,
        `- Langkah lanjutan: timeline pilot, scope tim, dan estimasi investasi`,
      ].join("\n");
    }

    case "cos-summary": {
      return [
        `# Topik dibahas`,
        `- Kebutuhan tim sales ${prospect.company} di segmen ${segment}`,
        `- Demo singkat ${productName} dan use-case relevan`,
        `- Pertanyaan teknis seputar integrasi & onboarding`,
        ``,
        `# Komitmen dari prospek`,
        `- ${prospect.name} bersedia berbagi data sampel pipeline minggu depan`,
        `- Setuju mengundang stakeholder lain pada sesi berikutnya`,
        ``,
        `# Tindak lanjut`,
        `- Sales kirim ringkasan + proposal awal dalam 2 hari kerja`,
        `- AE jadwalkan demo lanjutan dengan tim teknis prospek minggu depan`,
        `- ${prospect.name} review proposal sebelum sesi berikutnya`,
        ``,
        `# Status pipeline yang disarankan`,
        `- kualifikasi`,
      ].join("\n");
    }
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

const VALID_KINDS: AutopilotTextKind[] = [
  "linkedin-note",
  "intro-dm",
  "meeting-agenda",
  "cos-summary",
];

function validate(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return "Body harus berupa JSON object.";
  }
  const b = body as Partial<AutopilotTextRequest>;
  if (!b.kind || !VALID_KINDS.includes(b.kind)) {
    return "Field `kind` wajib salah satu dari: linkedin-note, intro-dm, meeting-agenda, cos-summary.";
  }
  if (!b.prospect || typeof b.prospect !== "object") {
    return "Field `prospect` wajib diisi.";
  }
  if (!b.prospect.name || typeof b.prospect.name !== "string") {
    return "Field `prospect.name` wajib diisi.";
  }
  if (!b.prospect.company || typeof b.prospect.company !== "string") {
    return "Field `prospect.company` wajib diisi.";
  }
  if (!b.kbSnapshot || typeof b.kbSnapshot !== "object") {
    return "Field `kbSnapshot` wajib diisi.";
  }
  return null;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: AutopilotTextRequest;
  try {
    body = (await request.json()) as AutopilotTextRequest;
  } catch {
    return NextResponse.json(
      { error: "Body harus berupa JSON yang valid." },
      { status: 400 },
    );
  }

  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Offline / demo path — no Gateway credential or NEXT_PUBLIC_AI_PROVIDER flag.
  if (!hasGatewayCredentials() || !isRealAiEnabled()) {
    const response: AutopilotTextResponse = {
      text: buildMockText(body),
      source: "mock",
    };
    return NextResponse.json(response);
  }

  const spec = buildPromptSpec(body);
  const system = buildKbSystemPrompt(body.kbSnapshot, {
    surface: spec.surface,
    segmentHint: body.prospect.segment,
  });

  try {
    // NOTE: AI SDK v6 uses `maxOutputTokens` (verified against
    // node_modules/ai/dist/index.d.ts → CallSettings) — NOT `maxTokens`.
    // Plain model string ("deepseek/deepseek-v4-flash") is resolved by the
    // Vercel AI Gateway via AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN in env.
    const result = await generateText({
      model: GATEWAY_MODEL_FAST,
      system,
      prompt: spec.user,
      temperature: spec.temperature,
      maxOutputTokens: spec.maxOutputTokens,
    });

    const text = (result.text ?? "").trim();
    if (!text) {
      // Empty completion — degrade to template rather than ship blank copy.
      const response: AutopilotTextResponse = {
        text: buildMockText(body),
        source: "mock",
      };
      return NextResponse.json(response);
    }

    const response: AutopilotTextResponse = { text, source: "real" };
    return NextResponse.json(response);
  } catch (error) {
    // Any provider/gateway error — degrade gracefully to the template.
    console.error("[autopilot/text] Deepseek call failed, falling back:", error);
    const response: AutopilotTextResponse = {
      text: buildMockText(body),
      source: "mock",
    };
    return NextResponse.json(response);
  }
}
