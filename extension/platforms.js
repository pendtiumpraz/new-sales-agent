// Multi-platform content script (doc 40/41). Runs on Google / Tokopedia / Shopee
// / Instagram / TikTok in the user's own session and scrapes leads on demand
// (SCAN_PLATFORM). Marketplaces → sellers/toko become COMPANY leads (potential
// B2B supplier/partner); Google → result sites become company candidates;
// IG/TikTok → profiles become PEOPLE. Selectors are BEST-EFFORT — these sites
// A/B-test + obfuscate heavily; tune against the live DOM (README §Tuning).

const clean = (s) => (s || "").trim().replace(/\s+/g, " ");
function abs(href) {
  if (!href) return "";
  try { const u = new URL(href, location.origin); u.hash = ""; return u.href; } catch { return ""; }
}
function detectPlatform() {
  const h = location.hostname;
  if (h.includes("google.")) return "google";
  if (h.includes("tokopedia.")) return "tokopedia";
  if (h.includes("shopee.")) return "shopee";
  if (h.includes("instagram.")) return "instagram";
  if (h.includes("tiktok.")) return "tiktok";
  return "unknown";
}

// Google organic results → company candidates (name = title, url = site).
function scrapeGoogle() {
  const companies = [];
  const seen = new Set();
  document.querySelectorAll("a h3").forEach((h3) => {
    const a = h3.closest("a");
    const url = abs(a && a.getAttribute("href"));
    const name = clean(h3.textContent);
    if (!url || !name || !/^https?:/.test(url) || /google\./.test(new URL(url).hostname)) return;
    const domain = new URL(url).hostname.replace(/^www\./, "");
    if (seen.has(domain)) return;
    seen.add(domain);
    companies.push({ name, domain, source: "google", sourceUrl: url });
  });
  return { companies: companies.slice(0, 30), people: [] };
}

// Marketplace seller/product cards → seller toko as COMPANY (with product hint).
function scrapeMarketplace(platform) {
  const companies = new Map();
  // best-effort: every product/shop link on a search page
  const sel =
    platform === "tokopedia"
      ? 'a[href*="/"][data-testid], a[href*="tokopedia.com/"]'
      : 'a[href*="shopee.co.id/"], a[data-sqe="link"]';
  document.querySelectorAll(sel).forEach((a) => {
    const url = abs(a.getAttribute("href"));
    if (!url) return;
    // a shop URL is usually the first path segment (toko name)
    let path = "";
    try { path = new URL(url).pathname.split("/").filter(Boolean)[0] || ""; } catch { return; }
    if (!path || ["search", "find", "p", "product"].includes(path.toLowerCase())) return;
    const productHint = clean(a.textContent).slice(0, 80);
    const tokoName = decodeURIComponent(path).replace(/[-_]/g, " ");
    if (!companies.has(path)) {
      companies.set(path, {
        name: tokoName,
        source: platform,
        sourceUrl: `${location.origin}/${path}`,
        summary: productHint || undefined,
      });
    }
  });
  return { companies: [...companies.values()].slice(0, 40), people: [] };
}

// IG / TikTok profile links → PEOPLE candidates.
function scrapeSocial(platform) {
  const people = new Map();
  document.querySelectorAll('a[href^="/"]').forEach((a) => {
    const href = a.getAttribute("href") || "";
    const m = href.match(platform === "tiktok" ? /^\/@([\w.]+)\/?$/ : /^\/([\w.]+)\/?$/);
    if (!m) return;
    const handle = m[1];
    if (["explore", "reels", "p", "accounts", "directory", "about", "foryou", "following"].includes(handle.toLowerCase())) return;
    const name = clean(a.textContent) || handle;
    if (!people.has(handle)) {
      people.set(handle, {
        fullName: name.length <= 60 ? name : handle,
        source: platform,
        sourceUrl: `${location.origin}/${platform === "tiktok" ? "@" : ""}${handle}`,
        socials: { [platform]: `${location.origin}/${platform === "tiktok" ? "@" : ""}${handle}` },
      });
    }
  });
  return { people: [...people.values()].slice(0, 40), companies: [] };
}

function scrapeCurrent() {
  const platform = detectPlatform();
  if (platform === "google") return { platform, ...scrapeGoogle() };
  if (platform === "tokopedia" || platform === "shopee") return { platform, ...scrapeMarketplace(platform) };
  if (platform === "instagram" || platform === "tiktok") return { platform, ...scrapeSocial(platform) };
  return { platform, companies: [], people: [] };
}

async function autoScroll(steps = 5, delay = 350) {
  for (let i = 0; i < steps; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, delay));
  }
  window.scrollTo(0, 0);
}

// Stage-2 core (doc 45) — capture the page's VISIBLE text (not class selectors) so
// DeepSeek in the background can extract structured fields. Mirrors content.js's
// profilePageText(): resilient to each platform's class-name churn.
function capturePageText() {
  const root = document.querySelector("main") || document.body;
  let t = (root.innerText || "").replace(/\n{2,}/g, "\n").trim();
  t = t.replace(/\b(Masuk|Daftar|Login|Sign up|Sign in|Download the app|Buka di aplikasi|Lihat selengkapnya|See more|Show more)\b/gi, "");
  return t.slice(0, 8000); // ~2k tokens — same budget as LinkedIn enrich
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === "SCAN_PLATFORM") {
        // Stage 1 — list scrape (buffers queue items carrying sourceUrl for Stage 2).
        await autoScroll();
        sendResponse({ ok: true, ...scrapeCurrent(), pageText: capturePageText() });
      } else if (msg && msg.type === "SCAN_ENRICH") {
        // Stage 2 — the orchestrator navigated to one profile/store/site; grab its text.
        await autoScroll(6, 400);
        sendResponse({ ok: true, platform: detectPlatform(), url: location.href.split("?")[0], pageText: capturePageText() });
      } else {
        sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});
