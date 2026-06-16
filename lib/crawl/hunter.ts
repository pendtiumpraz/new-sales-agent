// Hunter.io domain search (doc 21) — REAL people-level contacts per company:
// emails + names + positions + (sometimes) LinkedIn/phone. Complements the
// website crawler (which gets company-level info). NULL-SAFE: without
// HUNTER_API_KEY, hunterConfigured() is false and callers skip it.

export function hunterConfigured(): boolean {
  return Boolean(process.env.HUNTER_API_KEY);
}

export interface HunterPerson {
  email: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  department: string | null;
  seniority: string | null;
  linkedin: string | null;
  phone: string | null;
  confidence: number | null;
  type: string | null; // "personal" | "generic"
}

export interface HunterResult {
  domain: string | null;
  organization: string | null;
  people: HunterPerson[];
}

export async function hunterDomainSearch(domain: string, limit = 25): Promise<HunterResult> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) throw new Error("Hunter belum dikonfigurasi (HUNTER_API_KEY)");

  const url =
    `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}` +
    `&limit=${limit}&api_key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as {
    data?: {
      domain?: string;
      organization?: string;
      emails?: Array<Record<string, unknown>>;
    };
    errors?: Array<{ details?: string }>;
  };
  if (!res.ok) {
    throw new Error(`hunter ${res.status}: ${json.errors?.[0]?.details ?? "error"}`);
  }
  const data = json.data ?? {};
  const people: HunterPerson[] = (data.emails ?? []).map((e) => ({
    email: String(e.value ?? ""),
    firstName: (e.first_name as string) ?? null,
    lastName: (e.last_name as string) ?? null,
    position: (e.position as string) ?? null,
    department: (e.department as string) ?? null,
    seniority: (e.seniority as string) ?? null,
    linkedin: (e.linkedin as string) ?? null,
    phone: (e.phone_number as string) ?? null,
    confidence: (e.confidence as number) ?? null,
    type: (e.type as string) ?? null,
  })).filter((p) => p.email);

  return { domain: data.domain ?? domain, organization: data.organization ?? null, people };
}
