// Age-band estimation (doc 39 §3.1). We can't know exact age from a crawl — only
// a rough band from career seniority (or, later, graduation year from LinkedIn).
// Honest: a band, never a fabricated number.

const SENIOR = /(senior|lead|manager|manajer|director|direktur|head|kepala|owner|founder|ceo|cfo|cto|coo|vp|gm|komisaris|principal|partner)/i;
const JUNIOR = /(intern|magang|junior|staff|staf|fresh|admin|asisten|trainee|entry)/i;

export function ageBandFromSeniority(title?: string | null): string {
  const t = (title ?? "").toLowerCase().trim();
  if (!t) return "unknown";
  if (SENIOR.test(t)) return "40+";
  if (JUNIOR.test(t)) return "22-30";
  return "30-40";
}
