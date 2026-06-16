// Salutation / honorific engine (doc 39 §3.4). Derives gender from an Indonesian
// name + the right honorific (Pak/Bu/Mas/Mbak/Kak) so outbound messages address
// people properly instead of a robotic "Bapak/Ibu {nama}". Deterministic + fast
// (no AI call) — used at message time for every contact.

export type Gender = "male" | "female" | "unknown";

// Curated common Indonesian given names. Not exhaustive — unknown → we fall back
// to suffix heuristics, then "Kak". Lowercased.
const FEMALE = new Set([
  "siti", "ani", "ayu", "dewi", "sri", "rina", "putri", "indah", "lestari", "wati",
  "ningsih", "yanti", "fitri", "fitria", "nur", "nurul", "aisyah", "aisha", "khadijah",
  "maya", "mega", "intan", "ratna", "sari", "wulan", "anggraini", "rahayu", "puspita",
  "melati", "mawar", "citra", "cantika", "salsabila", "salsa", "nabila", "naila",
  "alya", "aulia", "amira", "amelia", "anisa", "annisa", "hani", "hana", "hanna",
  "tari", "lia", "lina", "mira", "nia", "dian", "diana", "kartika", "larasati",
  "miftah", "miftahul", "zahra", "zahira", "keisha", "kayla", "gita", "vina", "vita",
  "yuni", "yunita", "novi", "novita", "devi", "deva", "tika", "tiara", "bella",
  "rani", "rara", "rosa", "shinta", "sinta", "wira", "winda", "yulia", "yuliana",
  "endang", "erna", "elis", "elisa", "ema", "emma", "rita", "ririn", "susanti", "suci",
]);

const MALE = new Set([
  "budi", "agus", "andi", "ahmad", "muhammad", "mohamad", "abdul", "dedi", "doni",
  "dwi", "eko", "fajar", "feri", "ferry", "gilang", "hadi", "hendra", "hendro",
  "irwan", "joko", "jaya", "krisna", "kurniawan", "lukman", "made", "marwan", "nanda",
  "nugroho", "putra", "rizki", "rizal", "rizal", "rian", "rio", "rudi", "rudy",
  "saputra", "setiawan", "surya", "teguh", "tono", "wahyu", "wawan", "yusuf",
  "yoga", "yudi", "zaki", "zulkifli", "bayu", "bagas", "bambang", "candra", "chandra",
  "darmawan", "galih", "guntur", "hafiz", "ilham", "indra", "iqbal", "ivan", "kevin",
  "raka", "rama", "reza", "ridho", "ridwan", "riki", "riko", "samsul", "slamet",
  "taufik", "umar", "usman", "vino", "wisnu", "yanto", "yopi", "arif", "arief",
  "anton", "asep", "bintang", "danang", "ferdy", "gani", "harry", "imam", "johan",
]);

// Honorific prefixes that explicitly carry gender (strip + decide).
const PREFIX_GENDER: { re: RegExp; gender: Gender }[] = [
  { re: /^(bapak|bpk|pak|mr|tuan|tn)\b\.?\s+/i, gender: "male" },
  { re: /^(ibu|bu|mrs|ms|nyonya|ny|nona|nn)\b\.?\s+/i, gender: "female" },
  { re: /^(mas|abang|bang)\b\.?\s+/i, gender: "male" },
  { re: /^(mbak|mba|teteh|teh)\b\.?\s+/i, gender: "female" },
];

function cleanName(raw: string): string {
  return (raw ?? "")
    .replace(/\b(s\.?kom|s\.?e|s\.?t|s\.?h|m\.?m|m\.?kom|ph\.?d|dr|prof|ir|h|hj)\b\.?/gi, "")
    .replace(/[.,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstNameOf(fullName: string): string {
  const cleaned = cleanName(fullName);
  // Drop a leading honorific to get the real first token.
  let s = cleaned;
  for (const { re } of PREFIX_GENDER) s = s.replace(re, "");
  const first = s.split(" ")[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : (fullName ?? "").trim();
}

export function deriveGender(fullName: string): Gender {
  const cleaned = cleanName(fullName);
  // 1) Explicit honorific prefix wins.
  for (const { re, gender } of PREFIX_GENDER) if (re.test(cleaned)) return gender;

  const first = (cleaned.split(" ")[0] ?? "").toLowerCase();
  if (!first) return "unknown";
  // 2) Dictionary.
  if (FEMALE.has(first)) return "female";
  if (MALE.has(first)) return "male";
  // 3) Suffix heuristics (noisy → only strong-ish signals).
  if (/(wati|ningsih|yanti|sari|ani|ika|iyah|iah)$/.test(first)) return "female";
  if (/(anto|awan|aji|udin|udin|man|son|ndra)$/.test(first)) return "male";
  return "unknown";
}

export interface HonorificOpts {
  /** Job seniority/title — drives formal vs casual. */
  seniority?: string | null;
  title?: string | null;
  ageBand?: string | null; // "40+" → formal
}

function isFormal(opts?: HonorificOpts): boolean {
  const s = `${opts?.seniority ?? ""} ${opts?.title ?? ""}`.toLowerCase();
  if (/(senior|lead|manager|manajer|director|direktur|head|kepala|owner|founder|ceo|cfo|cto|coo|vp|gm|komisaris|principal)/.test(s)) {
    return true;
  }
  return opts?.ageBand === "40+";
}

/** Academic/professional title (overrides Pak/Bu) — Prof. for professors, Dr.
 *  for doctorate (S3/PhD). Detected from the name or the title/seniority. */
export function academicTitleFor(fullName: string, opts?: HonorificOpts): string | null {
  const hay = ` ${(fullName ?? "")} ${opts?.title ?? ""} ${opts?.seniority ?? ""} `.toLowerCase();
  if (/\b(prof|professor|profesor|guru besar)\b/.test(hay)) return "Prof.";
  if (/(\bdr\b|\bdrs?\b|doktor|ph\.?\s?d|\bs-?3\b|doctorate)/.test(hay)) return "Dr.";
  return null;
}

/** Honorific particle: Prof. | Dr. | Pak | Bu | Mas | Mbak | Kak. */
export function honorificFor(gender: Gender, opts?: HonorificOpts): string {
  const formal = isFormal(opts);
  if (gender === "male") return formal ? "Pak" : "Mas";
  if (gender === "female") return formal ? "Bu" : "Mbak";
  return "Kak";
}

export interface Salutation {
  gender: Gender;
  honorific: string; // Prof. | Dr. | Pak | Bu | Mas | Mbak | Kak
  firstName: string;
  /** Ready-to-use greeting, e.g. "Bu Siti", "Dr. Budi", "Kak Andi". */
  greeting: string;
  source: "academic" | "override" | "name" | "fallback";
}

export interface SalutationOverride extends HonorificOpts {
  /** Honorific the profiling layer derived from richer context (how people
   *  address them in comments / their content style). Wins over name heuristics
   *  but not an explicit academic title in the name. */
  honorific?: string | null;
  gender?: Gender | null;
}

/**
 * One call → how to address someone politely. Hierarchy (strongest first):
 *  1) academic title in the name (Prof./Dr.)
 *  2) override from profiling (how people call them in social comments + style)
 *  3) name→gender heuristic (Pak/Bu/Mas/Mbak)
 *  4) "Kak" when unknown.
 */
export function salutationFor(fullName: string, opts?: SalutationOverride): Salutation {
  const firstName = firstNameOf(fullName);
  const academic = academicTitleFor(fullName, opts);
  if (academic) {
    return { gender: deriveGender(fullName), honorific: academic, firstName, greeting: firstName ? `${academic} ${firstName}` : academic, source: "academic" };
  }
  if (opts?.honorific) {
    const g = opts.gender ?? deriveGender(fullName);
    return { gender: g, honorific: opts.honorific, firstName, greeting: firstName ? `${opts.honorific} ${firstName}` : opts.honorific, source: "override" };
  }
  const gender = opts?.gender ?? deriveGender(fullName);
  const honorific = honorificFor(gender, opts);
  return { gender, honorific, firstName, greeting: firstName ? `${honorific} ${firstName}` : honorific, source: gender === "unknown" ? "fallback" : "name" };
}
