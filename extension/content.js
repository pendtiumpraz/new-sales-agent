// Content script — runs in the USER's logged-in LinkedIn session (never logs in,
// never stores credentials). Three scrape modes:
//   SCAN_PEOPLE        → search results page (Stage 1): name + profile link + headline
//   SCAN_PROFILE       → an /in/ profile page (Stage 2): current role + company +
//                        experience (track record) + location + about
//   SCAN_CONTACT_INFO  → the /in/<id>/overlay/contact-info/ modal (Stage 2 extra):
//                        email / phone / website — ONLY populated for 1st-degree
//                        connections who chose to share it (else empty → skip).
//
// Selectors are BEST-EFFORT — LinkedIn's DOM is A/B-tested + changes often. If
// extraction comes back empty, tune these against the live page (README §Tuning).

// Load marker — if you DON'T see this in the LinkedIn tab's Console, the fresh
// content script is NOT running (stale tab → hard-reload the page after reloading
// the extension). Confirms v0.8.2 is live before you even run Stage 1.
try { console.log("[Maira] content.js v0.8.2 loaded →", location.href); } catch (e) { /* ignore */ }

function clean(s) {
  return (s || "").trim().replace(/\s+/g, " ");
}
function pick(el, selectors) {
  for (const sel of selectors) {
    const n = el.querySelector(sel);
    if (n && clean(n.textContent)) return clean(n.textContent);
  }
  return "";
}
function absUrl(href) {
  if (!href) return "";
  try {
    const u = new URL(href, location.origin);
    u.search = ""; // drop tracking params
    return u.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}
// Normalize any /in/ href to the canonical profile URL, dropping sub-paths,
// query, and the trailing slash — so the same person dedupes to one key.
function profileUrl(href) {
  if (!href) return "";
  try {
    const u = new URL(href, location.origin);
    const m = u.pathname.match(/\/in\/[^/?#]+/);
    return m ? "https://www.linkedin.com" + m[0] : "";
  } catch {
    return "";
  }
}
// Junk that shows up in a profile anchor's text but isn't the person's name.
const NAME_NOISE = /^(View|Lihat|LinkedIn Member|Anggota LinkedIn|Status is|•|·|\d(?:st|nd|rd|th)\b|Koneksi|Connection|Mutual|tingkat)/i;
// Collapse LinkedIn's duplicated name ("Budi SantosoBudi Santoso" or
// "Budi Santoso Budi Santoso") — happens because the visible + screen-reader
// copies both land in the text. Handles glued AND space-separated repeats.
function dedupeName(s) {
  s = s.trim();
  const m = s.match(/^(.+?)\s*\1$/); // "X X" / "XX" → "X"
  if (m) return m[1].trim();
  const w = s.split(/\s+/);
  if (w.length >= 2 && w.length % 2 === 0) {
    const h = w.length / 2;
    if (w.slice(0, h).join(" ") === w.slice(h).join(" ")) return w.slice(0, h).join(" ");
  }
  return s;
}

function nameFromAnchor(a) {
  // 1) visible name span; 2) aria-label "View X's profile"; 3) first line of text.
  const span = a.querySelector('span[aria-hidden="true"]');
  let name = clean(span ? span.textContent : "");
  if (!name) {
    const al = a.getAttribute("aria-label") || "";
    name = clean(al);
  }
  if (!name) name = clean((a.textContent || "").split("\n")[0]);
  name = name
    .replace(/^(View|Lihat)\s+/i, "")
    .replace(/(’s|'s)\s+profile.*$/i, "")
    // strip status/subtitle noise that LinkedIn glues onto the name text
    .replace(/\bis open to work\b/gi, " ")
    .replace(/\bopen to work\b/gi, " ")
    .replace(/\bis hiring\b/gi, " ")
    .replace(/\b(and\b.*?are mutual connections?|is a mutual connection)\b.*$/i, "")
    .replace(/\bstatus is (online|offline|reachable)\b/gi, " ");
  // cut trailing degree/headline appended on the same line ("• 3rd", double-space)
  name = name.split(/\s[•·|]\s|\s{2,}/)[0].trim();
  name = dedupeName(clean(name));
  return name.slice(0, 80);
}

// ── Stage 1: search results ────────────────────────────────────────────────
// LINK-ANCHORED scrape (resilient to LinkedIn's class-name churn): walk every
// profile (/in/) anchor inside the results area instead of relying on specific
// container classes. Name from the anchor; headline/location/company from the
// surrounding card text (best-effort).
function scrapePeople() {
  // Prefer <main>; fall back to the whole document if results live outside it.
  let anchors = (document.querySelector("main") || document.body).querySelectorAll('a[href*="/in/"]');
  if (anchors.length === 0) anchors = document.querySelectorAll('a[href*="/in/"]');

  // url -> { fullName, anchor }
  const byUrl = new Map();
  anchors.forEach((a) => {
    const url = profileUrl(a.getAttribute("href"));
    if (!url) return;
    const name = nameFromAnchor(a);
    const valid = name && !NAME_NOISE.test(name);
    const existing = byUrl.get(url);
    if (!existing) byUrl.set(url, { fullName: valid ? name : "", anchor: a });
    else if (valid && !existing.fullName) byUrl.set(url, { fullName: name, anchor: a });
  });

  const people = [];
  const companies = new Map();

  byUrl.forEach(({ fullName, anchor }, url) => {
    if (!fullName) return; // photo-only / nameless link → skip

    // Climb to the result card to read the headline + location text lines.
    const card =
      anchor.closest("li") ||
      anchor.closest('div[data-chameleon-result-urn], div[class*="entity-result"], div[componentkey]') ||
      anchor.parentElement?.closest("div") ||
      anchor.parentElement;
    let headline = "";
    let location = "";
    const summaryLines = [];
    if (card) {
      const lines = Array.from(card.querySelectorAll('span[aria-hidden="true"], .t-14, .t-12, p, [class*="subtitle"], [class*="summary"]'))
        .map((n) => clean(n.textContent))
        .filter((t) => t && t !== fullName && !NAME_NOISE.test(t));
      // de-dupe consecutive repeats
      const seen = new Set();
      for (const t of lines) {
        if (seen.has(t)) continue;
        seen.add(t);
        summaryLines.push(t);
      }
      headline = summaryLines[0] || "";
      location =
        summaryLines.find(
          (t) => t !== headline && /(,|Indonesia|Jakarta|Surabaya|Bandung|Medan|Bali|Yogyakarta|Area|Greater)/i.test(t) && t.length < 60,
        ) || "";
    }

    let title = headline;
    let companyName = "";
    const m = headline.match(/^(.*?)\s+(?:at|@|di)\s+(.+)$/i);
    if (m) {
      title = clean(m[1]);
      companyName = clean(m[2]);
    }
    // CURRENT/latest company line ("Current: … at PT X" / "Saat ini: PT X").
    const summary = summaryLines.find((t) => /(current|saat\s*ini)\s*:/i.test(t)) || "";
    const cm = summary.match(/(?:current|saat\s*ini)\s*:?\s*(.+)$/i);
    if (cm) {
      const cur = clean(cm[1]);
      const cm2 = cur.match(/^.*?\s+(?:at|@|di)\s+(.+)$/i);
      const currentCompany = cm2 ? clean(cm2[1]) : cur;
      if (currentCompany) companyName = currentCompany;
    }

    if (companyName) companies.set(companyName.toLowerCase(), companyName);

    people.push({
      fullName,
      title: title || undefined,
      companyName: companyName || undefined,
      location: location || undefined,
      linkedinUrl: url,
      source: "linkedin-extension",
    });
  });

  // Diagnostic — open DevTools (F12) → Console to see this if leads come back 0.
  try {
    console.log("[Maira] scrapePeople →", {
      anchors: anchors.length,
      people: people.length,
      sampleNames: people.slice(0, 5).map((p) => p.fullName),
      sampleHrefs: Array.from(anchors).slice(0, 5).map((a) => a.getAttribute("href")),
    });
  } catch (e) { /* ignore */ }

  return {
    people,
    companies: [...companies.values()].map((name) => ({ name, source: "linkedin-extension" })),
    anchors: anchors.length, // diagnostic: how many /in/ links were on the page
  };
}

// LinkedIn lazy-loads search results as you scroll — nudge the page to the
// bottom a few times so all ~10 results render before we scrape.
async function autoScroll(steps = 6, delay = 350) {
  for (let i = 0; i < steps; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, delay));
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 250));
}

// ── Stage 2: profile detail (track record) ──────────────────────────────────
function scrapeExperience() {
  // Experience section → array of {title, company, period}.
  const out = [];
  const section =
    document.querySelector("#experience") ||
    document.querySelector('section[id*="experience" i]') ||
    document.querySelector('div[id*="experience" i]');
  const root = section ? section.closest("section") || section.parentElement || section : document;
  const items = root.querySelectorAll(
    'li.artdeco-list__item, li.pvs-list__item--line-separated, div[data-view-name="profile-component-entity"]',
  );
  items.forEach((it) => {
    const title = pick(it, ['span[aria-hidden="true"]', '.t-bold span', '.mr1 span']);
    const company = pick(it, ['.t-14.t-normal span[aria-hidden="true"]', '.t-14 span']);
    const period = pick(it, ['.pvs-entity__caption-wrapper', '.t-black--light span[aria-hidden="true"]', '[class*="caption"]']);
    if (title) out.push({ title, company: company || undefined, period: period || undefined });
  });
  return out.slice(0, 12);
}

// Grab the profile's VISIBLE TEXT (not class-dependent). LinkedIn churns its
// class names constantly, so selector scraping rots fast — but the rendered text
// is stable. We hand this text to DeepSeek (in background.js) which extracts the
// structured fields + classifies. innerText (not textContent) ≈ what a human sees:
// it respects display:none / visually-hidden, dropping most of the SR-duplicate noise.
function profilePageText() {
  const root = document.querySelector("main") || document.body;
  let t = clean((root.innerText || "").replace(/\n{2,}/g, "\n"));
  // strip obvious LinkedIn chrome so the model spends tokens on the profile itself
  t = t
    .replace(/\b(Skip to (search|main content)|Keyboard shortcuts)\b/gi, "")
    .replace(/\bAd\b\s*•?/g, "");
  return t.slice(0, 8000); // ~2k tokens — plenty for one profile, cheap per call
}

function scrapeProfile() {
  const fullName = pick(document, ["h1.text-heading-xlarge", "main h1", "h1"]);
  const headline = pick(document, [".text-body-medium.break-words", ".pv-text-details__left-panel .text-body-medium"]);
  const location = pick(document, [".text-body-small.inline.t-black--light", ".pv-text-details__left-panel .text-body-small"]);
  const about = pick(document, ["#about ~ * .inline-show-more-text", 'section[id*="about" i] .inline-show-more-text', 'div[class*="display-flex"] .inline-show-more-text']);
  const experience = scrapeExperience();

  let title = headline;
  let companyName = (experience[0] && experience[0].company) || "";
  const m = headline.match(/^(.*?)\s+(?:at|@|di)\s+(.+)$/i);
  if (m) {
    title = clean(m[1]);
    if (!companyName) companyName = clean(m[2]);
  }

  return {
    // Selector-scraped fields are now only HINTS — DeepSeek re-derives them from
    // pageText, which is resilient to LinkedIn's class-name churn.
    fullName,
    title: title || undefined,
    companyName: companyName || undefined,
    location: location || undefined,
    about: about || undefined,
    experience,
    pageText: profilePageText(),
    linkedinUrl: profileUrl(window.location.href) || window.location.href.split("?")[0],
    source: "linkedin-extension",
  };
}

// ── Stage 2 extra: shared contact info overlay ──────────────────────────────
// The contact-info modal (URL /in/<id>/overlay/contact-info/) lives in a
// `.pv-contact-info` section with one `section.pv-contact-info__contact-type`
// per row (email, phone, websites, IM, birthday, connected). Each row labels
// its type via the icon/header text; emails are mailto: links, phones tel:
// links, websites plain http(s) links. Only 1st-degree connections who shared
// their details populate this — for everyone else it's empty (return {}).
function isWebsiteUrl(u) {
  // exclude LinkedIn's own links (e.g. the profile URL leaking into the modal)
  return /^https?:\/\//i.test(u) && !/(^|\.)linkedin\.com$/i.test((() => { try { return new URL(u).hostname; } catch { return ""; } })());
}
function scrapeContactInfo() {
  const root =
    document.querySelector(".pv-contact-info") ||
    document.querySelector('section[class*="pv-contact-info"]') ||
    document.querySelector('div[class*="artdeco-modal"] section') ||
    document;

  const out = {};

  // Email — always a mailto: link.
  const mail = root.querySelector('a[href^="mailto:"]');
  if (mail) {
    const v = clean((mail.getAttribute("href") || "").replace(/^mailto:/i, "").split("?")[0]) || clean(mail.textContent);
    if (v) out.email = v;
  }

  // Phone — tel: link, or the dedicated phone row's value span.
  const tel = root.querySelector('a[href^="tel:"]');
  if (tel) {
    const v = clean((tel.getAttribute("href") || "").replace(/^tel:/i, "")) || clean(tel.textContent);
    if (v) out.phone = v;
  }
  if (!out.phone) {
    const phoneSection = root.querySelector('section.pv-contact-info__contact-type[class*="phone" i], section.ci-phone');
    const v = pick(phoneSection || document.createElement("div"), [
      ".pv-contact-info__ci-container span",
      "li span",
      "span",
    ]);
    if (v && /\d/.test(v)) out.phone = v;
  }

  // Website — first non-LinkedIn http(s) link in the modal.
  const links = root.querySelectorAll('a[href^="http"]');
  for (const a of links) {
    const href = (a.getAttribute("href") || "").trim();
    if (isWebsiteUrl(href)) {
      out.website = href.replace(/\/$/, "");
      break;
    }
  }

  return out;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === "SCAN_PEOPLE") {
        await autoScroll(); // let lazy-loaded results render first
        sendResponse({ ok: true, ...scrapePeople() });
      } else if (msg && msg.type === "SCAN_PROFILE") {
        await autoScroll(8, 400); // load lazy experience/about sections into the DOM
        sendResponse({ ok: true, profile: scrapeProfile() });
      } else if (msg && msg.type === "SCAN_CONTACT_INFO") {
        sendResponse({ ok: true, contact: scrapeContactInfo() });
      } else {
        sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // keep the message channel open for the async sendResponse
});
