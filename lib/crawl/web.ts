// Real website crawler (doc 21) — server-side fetch + extract from PUBLIC pages.
// No API key, no browser; just HTTP GET + parse. Produces REAL company contact
// data (emails, phones, socials, name, description) from a target B2B site.
//
// Not a headless browser — it won't run JS-rendered SPAs fully, but most company
// sites expose contact info in the static HTML (footer, /contact, /about).

import { normalizeDomain } from "@/lib/profiling/dedup";

export interface CrawlResult {
  url: string;
  domain: string | null;
  name: string | null;
  description: string | null;
  emails: string[];
  phones: string[];
  socials: { linkedin?: string; instagram?: string; facebook?: string; twitter?: string };
  pagesTried: string[];
}

function normalizeUrl(raw: string): string {
  let u = (raw ?? "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u.replace(/\/+$/, "");
}

async function fetchHtml(url: string, timeoutMs = 7000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MairaSalesBot/1.0; +https://mairasales.com/bot)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) return null;
    const text = await res.text();
    return text.slice(0, 1_500_000); // cap large pages
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const uniq = (arr: string[]) => Array.from(new Set(arr));

function extractEmails(html: string): string[] {
  const matches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return uniq(
    matches
      .map((e) => e.toLowerCase())
      .filter(
        (e) =>
          !/\.(png|jpe?g|gif|svg|webp|css|js|ico|woff2?)$/i.test(e) && // asset filenames
          !/@(sentry|sentry\.io|wixpress|example\.com|email\.com|domain\.com)/.test(e) &&
          !e.startsWith("u003") &&
          e.length <= 60,
      ),
  ).slice(0, 20);
}

function extractPhones(html: string): string[] {
  const out: string[] = [];
  // tel: links — the highest-signal source.
  for (const m of html.match(/tel:\+?\d[\d\s().-]{6,}/gi) ?? []) {
    out.push(m.replace(/^tel:/i, ""));
  }
  // Indonesian mobile (08xx / +62 8xx / 62 8xx), optionally separated. This is
  // the relevant pattern for a WA-first ID market — avoids matching analytics
  // IDs / timestamps (long undelimited digit runs).
  for (const m of html.match(/(?:\+?62|0)8\d{1,2}[\s.-]?\d{3,4}[\s.-]?\d{3,5}/g) ?? []) {
    out.push(m);
  }
  // International numbers written WITH a + and separators.
  for (const m of html.match(/\+\d{1,3}[\s.-]\d{1,4}[\s.-]\d{3,4}(?:[\s.-]?\d{2,4})?/g) ?? []) {
    out.push(m);
  }
  return uniq(
    out
      .map((p) => p.replace(/[^\d+]/g, ""))
      .filter((p) => {
        const digits = p.replace(/\D/g, "");
        return digits.length >= 9 && digits.length <= 14;
      }),
  ).slice(0, 10);
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m?.[0] ?? null;
}

function extractSocials(html: string) {
  const socials: CrawlResult["socials"] = {};
  const lk = firstMatch(html, /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[^\s"'<>)]+/i);
  if (lk) socials.linkedin = lk;
  const ig = firstMatch(html, /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>)/]+/i);
  if (ig) socials.instagram = ig;
  const fb = firstMatch(html, /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>)/]+/i);
  if (fb) socials.facebook = fb;
  const tw = firstMatch(html, /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s"'<>)/]+/i);
  if (tw) socials.twitter = tw;
  return socials;
}

function metaContent(html: string, key: string, attr: "name" | "property"): string | null {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["']`, "i");
  const m = html.match(re);
  return m?.[1]?.trim() ?? null;
}

function extract(html: string): Partial<CrawlResult> {
  const name =
    metaContent(html, "og:site_name", "property") ??
    firstMatch(html, /<title[^>]*>[^<]+/i)?.replace(/<title[^>]*>/i, "").trim() ??
    null;
  const description =
    metaContent(html, "description", "name") ?? metaContent(html, "og:description", "property") ?? null;
  return {
    name: name ? name.slice(0, 200) : null,
    description: description ? description.slice(0, 500) : null,
    emails: extractEmails(html),
    phones: extractPhones(html),
    socials: extractSocials(html),
  };
}

/** Crawl a company website: homepage + common contact/about paths.
 *  budgetMs caps the TOTAL time so it always returns within a serverless function
 *  window (Vercel Hobby ~10s / Pro 60s) — returns partial results before timeout
 *  instead of letting the whole function 504. */
export async function crawlWebsite(rawUrl: string, budgetMs = 12000): Promise<CrawlResult> {
  const url = normalizeUrl(rawUrl);
  const domain = normalizeDomain(url);
  const result: CrawlResult = {
    url,
    domain,
    name: null,
    description: null,
    emails: [],
    phones: [],
    socials: {},
    pagesTried: [],
  };
  if (!url) return result;

  const deadline = Date.now() + budgetMs;
  const paths = ["", "/contact", "/kontak", "/about", "/tentang-kami", "/contact-us"];
  for (const p of paths) {
    if (Date.now() > deadline) break; // stay inside the serverless budget
    const remaining = deadline - Date.now();
    const html = await fetchHtml(url + p, Math.min(7000, Math.max(2000, remaining)));
    if (!html) continue;
    result.pagesTried.push(url + p);
    const ex = extract(html);
    if (!result.name && ex.name) result.name = ex.name;
    if (!result.description && ex.description) result.description = ex.description;
    result.emails = uniq([...result.emails, ...(ex.emails ?? [])]).slice(0, 20);
    result.phones = uniq([...result.phones, ...(ex.phones ?? [])]).slice(0, 10);
    result.socials = { ...(ex.socials ?? {}), ...result.socials };
    // Stop early once we have solid contact signal from the homepage + one page.
    if (result.emails.length >= 3 && result.pagesTried.length >= 2) break;
  }
  return result;
}
