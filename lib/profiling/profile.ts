// FORD profiling synthesis (doc 39 §3). Turns the signals we have on a person
// (name, title, company, industry, + optional social content) into a structured
// profile: gender, the RIGHT honorific (Prof./Dr./Pak/Bu/Mas/Mbak/Kak), age band,
// interests, FORD (Family/Occupation/Recreation/Dreams), tone, and a summary.
//
// GROUNDED: the AI is told to never invent what isn't supported — Family is left
// empty (PDP), Recreation/Dreams only from real social context. The honorific
// prefers how people actually address the person in social comments + their
// language style (when socialContext is supplied), per doc 39 §3.4.

import { meteredGenerateText } from "@/lib/ai/meter";
import { stripMarkdown } from "@/lib/ai/sanitize";
import { SAFETY_RULES, wrapUntrusted, looksInjected } from "@/lib/ai/safety";
import type { TenantContext } from "@/lib/db/tenant-context";
import { ageBandFromSeniority } from "./age";
import { type Gender, salutationFor } from "./salutation";

export interface ProfileInput {
  fullName: string;
  title?: string | null;
  company?: string | null;
  industry?: string | null;
  /** Posts/comments text from a social crawl/search — optional grounding. */
  socialContext?: string | null;
}

export interface ProfileResult {
  gender: Gender;
  honorific: string;
  greeting: string;
  ageBand: string;
  interests: string[];
  ford: { occupation: string; recreation: string; family: string; dreams: string };
  tone: string; // formal | santai | hangat
  summary: string;
  confidence: number;
  source: "ai" | "heuristic";
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function synthesizeProfile(ctx: TenantContext, input: ProfileInput): Promise<ProfileResult> {
  const ageBand = ageBandFromSeniority(input.title);
  const base = salutationFor(input.fullName, { title: input.title, ageBand });
  const fallback: ProfileResult = {
    gender: base.gender,
    honorific: base.honorific,
    greeting: base.greeting,
    ageBand,
    interests: [],
    ford: { occupation: input.title ?? "", recreation: "", family: "", dreams: "" },
    tone: "hangat",
    summary: "",
    confidence: 0.3,
    source: "heuristic",
  };

  try {
    const { text } = await meteredGenerateText(ctx, {
      feature: "profiling",
      system:
        "Kamu analis profiling sales B2B Indonesia. Keluarkan HANYA JSON valid (tanpa markdown). " +
        "GROUNDED: jangan mengarang yang tidak ada datanya — kosongkan kalau tak tahu. Hormati privasi. " +
        SAFETY_RULES,
      prompt:
        `Susun profil singkat untuk pendekatan sales yang sopan & ber-empati.\n` +
        `Nama: ${input.fullName}\nJabatan: ${input.title ?? "-"}\nPerusahaan: ${input.company ?? "-"} (industri: ${input.industry ?? "-"})\n` +
        // socialContext = crawled/searched text → untrusted (doc 43 §2/§3.4): wrap as
        // data; omit entirely if it carries injection patterns.
        (input.socialContext && !looksInjected(input.socialContext)
          ? `Konten/komentar sosmed (sumber utama untuk sapaan & minat):\n${wrapUntrusted("SOSMED", input.socialContext.slice(0, 2000))}\n`
          : `Tidak ada konten sosmed.\n`) +
        `\nKeluarkan JSON skema persis:\n{\n` +
        `"gender": "male|female|unknown",\n` +
        `"honorific": "Pak|Bu|Mas|Mbak|Prof.|Dr.|Kak" — UTAMAKAN dari cara orang memanggil dia di komentar + gaya bahasanya; kalau tak ada konteks, dari nama/jabatan,\n` +
        `"ageBand": "22-30|30-40|40+|unknown",\n` +
        `"interests": [tag minat dari konten/industri; [] kalau tak ada],\n` +
        `"ford": {"occupation":"ringkas dari jabatan/perusahaan","recreation":"dari sosmed; '' kalau tak ada","family":"" (KOSONGKAN — sensitif),"dreams":"inferred singkat; '' kalau ragu"},\n` +
        `"tone": "formal|santai|hangat" (sesuaikan gaya bahasanya),\n` +
        `"summary": "2-3 kalimat untuk rep",\n` +
        `"confidence": 0..1\n}`,
      maxOutputTokens: 500,
    });
    const j = parseJson(text);
    if (j) {
      const gender = (["male", "female", "unknown"].includes(String(j.gender)) ? j.gender : base.gender) as Gender;
      const honorific = (String(j.honorific ?? "").trim() || base.honorific) as string;
      // salutationFor re-applies the hierarchy (academic title in the name still
      // wins over the AI's honorific).
      const sal = salutationFor(input.fullName, { honorific, gender, title: input.title, ageBand });
      const ford = (j.ford ?? {}) as Record<string, string>;
      return {
        gender: sal.gender,
        honorific: sal.honorific,
        greeting: sal.greeting,
        ageBand: String(j.ageBand ?? ageBand),
        // doc 43 §1 — these free-text fields are rendered in the profiles UI; strip markdown.
        interests: Array.isArray(j.interests) ? (j.interests as unknown[]).map((x) => stripMarkdown(String(x))).slice(0, 8) : [],
        ford: {
          occupation: stripMarkdown(String(ford.occupation ?? input.title ?? "")),
          recreation: stripMarkdown(String(ford.recreation ?? "")),
          family: "", // never store family from crawl (PDP)
          dreams: stripMarkdown(String(ford.dreams ?? "")),
        },
        tone: String(j.tone ?? "hangat"),
        summary: stripMarkdown(String(j.summary ?? "")).slice(0, 600),
        confidence: typeof j.confidence === "number" ? j.confidence : 0.5,
        source: "ai",
      };
    }
  } catch {
    // no model / suspended / provider error → heuristic
  }
  return fallback;
}
