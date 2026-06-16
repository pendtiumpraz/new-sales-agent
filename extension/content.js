// Content script — runs in the USER's logged-in LinkedIn session (never logs in,
// never stores credentials). Two scrape modes:
//   SCAN_PEOPLE   → search results page (Stage 1): name + profile link + headline
//   SCAN_PROFILE  → an /in/ profile page (Stage 2): current role + company +
//                   experience (track record) + location + about
//
// Selectors are BEST-EFFORT — LinkedIn's DOM is A/B-tested + changes often. If
// extraction comes back empty, tune these against the live page (README §Tuning).

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

// ── Stage 1: search results ────────────────────────────────────────────────
function scrapePeople() {
  const containers = document.querySelectorAll(
    [
      'li.reusable-search__result-container',
      'div[data-view-name="search-entity-result-universal-template"]',
      'li.entity-result',
      'div.entity-result',
    ].join(","),
  );

  const people = [];
  const companies = new Map();

  containers.forEach((el) => {
    const linkEl = el.querySelector('a[href*="/in/"]');
    const linkedinUrl = absUrl(linkEl && linkEl.getAttribute("href"));
    const fullName = pick(el, [
      '.entity-result__title-text a span[aria-hidden="true"]',
      '.entity-result__title-text a',
      'a[href*="/in/"] span[aria-hidden="true"]',
      'a[href*="/in/"]',
    ]);
    if (!fullName || /^LinkedIn Member$/i.test(fullName)) return;

    const headline = pick(el, ['.entity-result__primary-subtitle', '[class*="primary-subtitle"]']);
    const location = pick(el, ['.entity-result__secondary-subtitle', '[class*="secondary-subtitle"]']);

    let title = headline;
    let companyName = "";
    const m = headline.match(/^(.*?)\s+(?:at|@|di)\s+(.+)$/i);
    if (m) {
      title = clean(m[1]);
      companyName = clean(m[2]);
    }

    // CURRENT/latest company — LinkedIn highlights it in a summary line, e.g.
    // "Current: Manager at PT X" / "Saat ini: PT X". Prefer this over the headline.
    const summary = pick(el, [
      '.entity-result__summary',
      '[class*="entity-result__summary"]',
      '.entity-result__content-summary',
      'p.entity-result__summary--2-lines',
    ]);
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
      companyName: companyName || undefined, // current/latest company
      location: location || undefined,
      linkedinUrl: linkedinUrl || undefined,
      source: "linkedin-extension",
    });
  });

  return {
    people,
    companies: [...companies.values()].map((name) => ({ name, source: "linkedin-extension" })),
  };
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

function scrapeProfile() {
  const fullName = pick(document, ["h1.text-heading-xlarge", "h1"]);
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
    fullName,
    title: title || undefined,
    companyName: companyName || undefined,
    location: location || undefined,
    about: about || undefined,
    experience,
    linkedinUrl: absUrl(location.href ? location.href : window.location.href),
    source: "linkedin-extension",
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  try {
    if (msg && msg.type === "SCAN_PEOPLE") {
      sendResponse({ ok: true, ...scrapePeople() });
    } else if (msg && msg.type === "SCAN_PROFILE") {
      sendResponse({ ok: true, profile: scrapeProfile() });
    }
  } catch (e) {
    sendResponse({ ok: false, error: String(e) });
  }
  return true;
});
