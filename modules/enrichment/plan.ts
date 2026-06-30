import type { TenantContext } from "@/lib/db/tenant-context";
import { meteredGenerateText } from "@/lib/ai/meter";
import { SAFETY_RULES } from "@/lib/ai/safety";

/**
 * CROSS-CHANNEL discovery planner (rebuild — Module 5 · enrichment/discovery).
 *
 * The goal of discovery is a Company→People GRAPH that can be filled from ANY
 * channel — NOT a LinkedIn-only hunt. So the planner is CHANNEL-NEUTRAL: it
 * returns per-channel guidance (LinkedIn, Google Maps, Google dorks, Instagram,
 * Facebook, marketplace, TikTok) PLUS channel-agnostic scaffolding (roles,
 * industries, candidate companies, keywords). No channel is the default; the rep
 * (or the extension RPA in a later phase) picks whichever channels fit the ICP.
 *
 * The AI NEVER fabricates real people — it plans the search. The real, verifiable
 * Company/People rows come from the extension RPA / website crawl and are ingested
 * through the channel-agnostic graph endpoint (`/api/discovery/ingest`).
 *
 * AI contract: the model is reached ONLY through `meteredGenerateText` (tenant
 * credit + key + usage logging) and asked to return EXACTLY the JSON shape below
 * (a typed "JSON schema" the parser enforces defensively). ANY failure (no key,
 * credit out, bad JSON) degrades to a deterministic heuristic plan — discovery
 * never dies on a planner hiccup, and we never surface "token habis".
 */

// ── per-channel guidance shapes ──────────────────────────────────────────────
/** LinkedIn: people-search + intent-mining (commenters/reactors of a post ARE leads). */
export interface LinkedInChannelPlan {
  /** Ready-to-run people-search query strings (title + location). */
  searchQueries: string[];
  /** Heuristics for spotting a fit profile (headline/keywords to look for). */
  profileHints: string[];
  /**
   * INTENT MINING: posts/keywords whose COMMENTERS or REACTORS are likely buyers
   * (e.g. "search this phrase, then scrape everyone who engaged with the top posts").
   */
  postSearch: string[];
}

/** Google Maps: business-category + area → PT + phone + address + category. */
export interface GoogleMapsChannelPlan {
  /** "category in area" search strings (e.g. "klinik gigi Surabaya"). */
  queries: string[];
  /** Business categories to filter on (Maps category labels). */
  categories: string[];
  /** Geographic areas to sweep (city / district / region). */
  areas: string[];
}

/** A generic search/handle channel: just a list of query strings + a note. */
export interface SearchChannelPlan {
  /** Search strings / hashtags / store-search terms for this channel. */
  queries: string[];
  /** One-line guidance on how to mine this channel (kept honest about WIP). */
  note: string;
}

/** Marketplace (Shopee / Tokopedia): store + product search → seller leads. */
export interface MarketplaceChannelPlan {
  /** Shopee store/product search terms. */
  shopee: string[];
  /** Tokopedia store/product search terms. */
  tokopedia: string[];
  note: string;
}

// ── candidate company (channel-agnostic scaffolding) ─────────────────────────
export interface DiscoveryCompany {
  name: string;
  why: string;
  domainGuess?: string; // best-effort — verified only when a crawl/ingest succeeds
}

// ── the cross-channel plan ───────────────────────────────────────────────────
export interface DiscoveryPlan {
  field: string;
  location: string;
  // Channel-agnostic scaffolding (the Company→People graph targets).
  roles: string[];
  industries: string[];
  companies: DiscoveryCompany[];
  keywords: string[];
  // Per-channel guidance — NO channel is the default; fill what fits the ICP.
  linkedin: LinkedInChannelPlan;
  googleMaps: GoogleMapsChannelPlan;
  googleDorks: string[];
  instagram: SearchChannelPlan;
  facebook: SearchChannelPlan;
  marketplace: MarketplaceChannelPlan;
  tiktok: SearchChannelPlan;
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

function asStringArray(v: unknown, cap = 12): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? clean(x) : ""))
    .filter(Boolean)
    .slice(0, cap);
}

// ── deterministic fallback (no AI model / parse fail) ─────────────────────────
// Still channel-neutral and useful: every channel gets at least a seed query so
// the rep can start somewhere on ANY platform, not just LinkedIn.
export function heuristicPlan(input: PlanInput): DiscoveryPlan {
  const field = clean(input.field);
  const location = clean(input.location || "Indonesia");
  const titles =
    input.seniority && SENIORITY_TITLES[input.seniority]
      ? SENIORITY_TITLES[input.seniority]
      : ["Manager", "Head", "Lead", "Specialist", "Staff"];
  const roles = titles.map((t) => `${field} ${t}`);
  return {
    field,
    location,
    roles,
    industries: [field],
    companies: [],
    keywords: [field, ...titles],
    linkedin: {
      searchQueries: [
        `${field} ${location}`,
        ...titles.slice(0, 3).map((t) => `${field} ${t} ${location}`),
      ],
      profileHints: [`Headline menyebut "${field}"`, `Lokasi ${location}`],
      postSearch: [
        `"${field}" tips`,
        `"${field}" rekomendasi — scrape yang nge-comment/react`,
      ],
    },
    googleMaps: {
      queries: [`${field} ${location}`],
      categories: [field],
      areas: [location],
    },
    googleDorks: [
      `site:linkedin.com/in "${field}" "${location}"`,
      `"${field}" perusahaan ${location} kontak`,
    ],
    instagram: {
      queries: [`#${field.replace(/\s+/g, "")}`, `${field} ${location}`],
      note: "Cari hashtag/bio terkait, ambil akun bisnis yang relevan (WIP — scraper di fase extension).",
    },
    facebook: {
      queries: [`${field} ${location}`],
      note: "Cari Page/Group bisnis di area target (WIP — scraper di fase extension).",
    },
    marketplace: {
      shopee: [`${field}`],
      tokopedia: [`${field}`],
      note: "Cari toko/produk untuk dapat seller B2B (WIP — scraper di fase extension).",
    },
    tiktok: {
      queries: [`${field}`, `${field} ${location}`],
      note: "Cari kreator/akun bisnis niche (WIP — scraper di fase extension).",
    },
    note:
      "Rencana heuristik (model AI tak aktif). Lintas-kanal: orang asli didapat lewat extension / crawl per kanal — bukan dikarang AI.",
  };
}

// ── AI JSON contract (the model returns EXACTLY this shape) ───────────────────
// Parsed defensively (untrusted output): missing/typo'd fields fall back to the
// heuristic per-channel block so the returned plan is always complete + typed.
interface PlanJson {
  roles?: unknown;
  industries?: unknown;
  companies?: unknown;
  keywords?: unknown;
  linkedin?: { searchQueries?: unknown; profileHints?: unknown; postSearch?: unknown };
  googleMaps?: { queries?: unknown; categories?: unknown; areas?: unknown };
  googleDorks?: unknown;
  instagram?: { queries?: unknown; note?: unknown };
  facebook?: { queries?: unknown; note?: unknown };
  marketplace?: { shopee?: unknown; tokopedia?: unknown; note?: unknown };
  tiktok?: { queries?: unknown; note?: unknown };
}

function parseJson(text: string): PlanJson | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as PlanJson;
  } catch {
    return null;
  }
}

function noteOf(v: { note?: unknown } | undefined, fallback: string): string {
  return v && typeof v.note === "string" && v.note.trim() ? clean(v.note) : fallback;
}

/**
 * Build a CROSS-CHANNEL discovery plan for a field/profession + Indonesian
 * location. Metered AI with a strict JSON contract; degrades to `heuristicPlan`
 * on any failure. Channel-neutral — every channel block is always populated
 * (AI-filled or heuristic), so the UI can render whichever channels the rep wants.
 */
export async function planDiscoveryChannels(
  ctx: TenantContext,
  input: PlanInput,
): Promise<DiscoveryPlan> {
  const field = clean(input.field);
  const location = clean(input.location || "Indonesia");
  if (!field) return heuristicPlan({ ...input, field: "" });

  const hp = heuristicPlan(input); // per-channel fallbacks come from here

  try {
    const { text } = await meteredGenerateText(ctx, {
      feature: "discovery-plan",
      system:
        "Kamu perencana lead-generation B2B/B2C di Indonesia. Susun RENCANA LINTAS-KANAL " +
        "untuk membangun graf Perusahaan→Orang di sebuah bidang/pekerjaan + lokasi — " +
        "BUKAN mengarang nama orang. TIDAK ADA kanal yang jadi default; isi tiap kanal " +
        "yang relevan dengan ICP. Untuk linkedin.postSearch: beri frasa/post yang KOMENTATOR " +
        "atau REACTOR-nya kemungkinan calon pembeli (intent mining). Untuk googleMaps: query " +
        '"kategori di area" + kategori bisnis + area, untuk dapat PT + telepon + alamat. ' +
        "Untuk companies: kandidat perusahaan NYATA di Indonesia + alasan singkat — hipotesis " +
        "yang HARUS diverifikasi lewat crawl, bukan fakta final. " +
        "Balas HANYA JSON valid dengan kunci persis: " +
        '{"roles":[],"industries":[],"companies":[{"name":"","why":"","domainGuess":""}],"keywords":[],' +
        '"linkedin":{"searchQueries":[],"profileHints":[],"postSearch":[]},' +
        '"googleMaps":{"queries":[],"categories":[],"areas":[]},' +
        '"googleDorks":[],' +
        '"instagram":{"queries":[],"note":""},' +
        '"facebook":{"queries":[],"note":""},' +
        '"marketplace":{"shopee":[],"tokopedia":[],"note":""},' +
        '"tiktok":{"queries":[],"note":""}}. ' +
        "Tanpa teks lain di luar JSON. " +
        SAFETY_RULES,
      prompt:
        `Bidang/pekerjaan: ${field}\n` +
        `Lokasi target: ${location}\n` +
        `Seniority: ${input.seniority || "(semua)"}\n` +
        "Susun rencana discovery LINTAS-KANAL yang actionable untuk sales Indonesia. JSON saja.",
      // Reasoning models are floored to >=1200 by the meter; this is the visible
      // budget for the (larger) cross-channel JSON.
      maxOutputTokens: 1200,
    });

    const p = text ? parseJson(text) : null;
    if (p) {
      // Candidate companies (defensive per-item parse).
      const companies: DiscoveryCompany[] = [];
      if (Array.isArray(p.companies)) {
        for (const c of p.companies.slice(0, 12)) {
          const o = c as { name?: unknown; why?: unknown; domainGuess?: unknown };
          const name = typeof o.name === "string" ? clean(o.name) : "";
          if (!name) continue;
          const company: DiscoveryCompany = {
            name,
            why: typeof o.why === "string" ? clean(o.why) : "",
          };
          if (typeof o.domainGuess === "string" && o.domainGuess.trim()) {
            company.domainGuess = clean(o.domainGuess);
          }
          companies.push(company);
        }
      }

      const linkedinQueries = asStringArray(p.linkedin?.searchQueries, 8);
      const roles = asStringArray(p.roles);
      const mapsQueries = asStringArray(p.googleMaps?.queries, 8);

      // Accept the plan only if the model produced *some* actionable signal;
      // otherwise fall through to the full heuristic.
      if (linkedinQueries.length || roles.length || companies.length || mapsQueries.length) {
        return {
          field,
          location,
          roles: roles.length ? roles : hp.roles,
          industries: asStringArray(p.industries, 8),
          companies,
          keywords: asStringArray(p.keywords, 16),
          linkedin: {
            searchQueries: linkedinQueries.length ? linkedinQueries : hp.linkedin.searchQueries,
            profileHints: asStringArray(p.linkedin?.profileHints, 8),
            postSearch: asStringArray(p.linkedin?.postSearch, 8),
          },
          googleMaps: {
            queries: mapsQueries.length ? mapsQueries : hp.googleMaps.queries,
            categories: asStringArray(p.googleMaps?.categories, 8),
            areas: asStringArray(p.googleMaps?.areas, 8),
          },
          googleDorks: asStringArray(p.googleDorks, 6),
          instagram: {
            queries: asStringArray(p.instagram?.queries, 8),
            note: noteOf(p.instagram, hp.instagram.note),
          },
          facebook: {
            queries: asStringArray(p.facebook?.queries, 8),
            note: noteOf(p.facebook, hp.facebook.note),
          },
          marketplace: {
            shopee: asStringArray(p.marketplace?.shopee, 8),
            tokopedia: asStringArray(p.marketplace?.tokopedia, 8),
            note: noteOf(p.marketplace, hp.marketplace.note),
          },
          tiktok: {
            queries: asStringArray(p.tiktok?.queries, 8),
            note: noteOf(p.tiktok, hp.tiktok.note),
          },
          note:
            "AI menyusun rencana lintas-kanal; orang asli didapat lewat extension / crawl per kanal (diverifikasi), tidak dikarang.",
        };
      }
    }
  } catch {
    // no model / credit out / parse fail → heuristic (never throw "token habis")
  }
  return hp;
}
