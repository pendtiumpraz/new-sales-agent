import { meteredGenerateText } from "@/lib/ai/meter";
import { SAFETY_RULES } from "@/lib/ai/safety";
import type { TenantContext } from "@/lib/db/tenant-context";

// AI discovery planner (doc 40) — turn a profession/field + Indonesian location
// into an ACTIONABLE hunt plan: which job titles to target, relevant industries,
// candidate companies (to verify by crawl), and ready-to-run LinkedIn search
// queries. The AI never fabricates real people — it plans the search; the
// extension RPA / website crawler then fetch the real, verifiable contacts.

export interface DiscoveryCompany {
  name: string;
  why: string;
  domainGuess?: string; // best-effort — verified only when the crawl succeeds
}

export interface DiscoveryPlan {
  field: string;
  location: string;
  roles: string[];
  industries: string[];
  companies: DiscoveryCompany[];
  linkedinQueries: string[];
  googleDorks: string[];
  keywords: string[];
  note: string;
}

export interface PlanInput {
  field: string;
  location?: string | null;
  seniority?: string | null; // junior | mid | senior | ""
}

const SENIORITY_TITLES: Record<string, string[]> = {
  junior: ["Staff", "Officer", "Associate", "Junior"],
  mid: ["Supervisor", "Lead", "Specialist", "Coordinator"],
  senior: ["Manager", "Head", "Director", "VP", "GM"],
};

function clean(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

// Deterministic fallback — still useful with no AI model.
export function heuristicPlan(input: PlanInput): DiscoveryPlan {
  const field = clean(input.field);
  const location = clean(input.location || "Indonesia");
  const titles = input.seniority && SENIORITY_TITLES[input.seniority]
    ? SENIORITY_TITLES[input.seniority]
    : ["Manager", "Head", "Lead", "Specialist", "Staff"];
  const roles = titles.map((t) => `${field} ${t}`);
  const linkedinQueries = [
    `${field} ${location}`,
    ...titles.slice(0, 3).map((t) => `${field} ${t} ${location}`),
  ];
  return {
    field,
    location,
    roles,
    industries: [field],
    companies: [],
    linkedinQueries,
    googleDorks: [
      `site:linkedin.com/in "${field}" "${location}"`,
      `"${field}" perusahaan ${location} kontak`,
    ],
    keywords: [field, ...titles],
    note: "Rencana heuristik (model AI tak aktif). Orang asli didapat lewat extension LinkedIn / crawl website — bukan dikarang AI.",
  };
}

function parseJson(text: string): Partial<DiscoveryPlan> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function asStringArray(v: unknown, cap = 12): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? clean(x) : "")).filter(Boolean).slice(0, cap);
}

export async function planDiscovery(ctx: TenantContext, input: PlanInput): Promise<DiscoveryPlan> {
  const field = clean(input.field);
  const location = clean(input.location || "Indonesia");
  if (!field) return heuristicPlan({ ...input, field: "" });

  try {
    const { text } = await meteredGenerateText(ctx, {
      feature: "discovery",
      system:
        `Kamu perencana lead-generation B2B di Indonesia. Tugasmu menyusun RENCANA menemukan ORANG ` +
        `di sebuah bidang/pekerjaan pada lokasi tertentu — BUKAN mengarang nama orang. ` +
        `Untuk "companies", beri kandidat perusahaan NYATA di Indonesia yang relevan + alasan singkat; ` +
        `ini hipotesis yang HARUS diverifikasi lewat crawl, jangan anggap fakta final. ` +
        `Balas HANYA JSON valid: {"roles":[],"industries":[],"companies":[{"name":"","why":"","domainGuess":""}],` +
        `"linkedinQueries":[],"googleDorks":[],"keywords":[]}. ` +
        `roles = titel jabatan untuk dicari (campur Indonesia & Inggris). ` +
        `linkedinQueries = string siap-pakai untuk people-search (titel + lokasi). ` +
        SAFETY_RULES,
      prompt:
        `Bidang/pekerjaan: ${field}\n` +
        `Lokasi target: ${location}\n` +
        `Seniority: ${input.seniority || "(semua)"}\n` +
        `Susun rencana discovery yang actionable untuk sales Indonesia.`,
      maxOutputTokens: 700,
    });
    const p = text ? parseJson(text) : null;
    if (p) {
      const companies: DiscoveryCompany[] = [];
      if (Array.isArray(p.companies)) {
        for (const c of p.companies.slice(0, 12)) {
          const o = c as { name?: unknown; why?: unknown; domainGuess?: unknown };
          const name = typeof o.name === "string" ? clean(o.name) : "";
          if (!name) continue;
          const company: DiscoveryCompany = { name, why: typeof o.why === "string" ? clean(o.why) : "" };
          if (typeof o.domainGuess === "string" && o.domainGuess.trim()) company.domainGuess = clean(o.domainGuess);
          companies.push(company);
        }
      }
      const roles = asStringArray(p.roles);
      const linkedinQueries = asStringArray(p.linkedinQueries, 8);
      if (roles.length || linkedinQueries.length || companies.length) {
        return {
          field,
          location,
          roles: roles.length ? roles : heuristicPlan(input).roles,
          industries: asStringArray(p.industries, 8),
          companies,
          linkedinQueries: linkedinQueries.length ? linkedinQueries : heuristicPlan(input).linkedinQueries,
          googleDorks: asStringArray(p.googleDorks, 6),
          keywords: asStringArray(p.keywords, 16),
          note: "AI menyusun rencana; ORANG asli didapat lewat extension LinkedIn / crawl website (diverifikasi), tidak dikarang.",
        };
      }
    }
  } catch {
    // no model / parse fail → heuristic
  }
  return heuristicPlan(input);
}
