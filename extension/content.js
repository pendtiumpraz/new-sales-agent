// Content script — runs on LinkedIn /search pages. Reads the results the USER is
// already viewing in their own session; it never logs in or stores credentials.
//
// Selectors are best-effort: LinkedIn's DOM changes often and is A/B-tested, so
// tune these against the live page if extraction comes back empty.
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
    const fullName = pick(el, [
      '.entity-result__title-text a span[aria-hidden="true"]',
      '.entity-result__title-text a',
      'a[href*="/in/"] span[aria-hidden="true"]',
      'a[href*="/in/"]',
    ]);
    if (!fullName || /^LinkedIn Member$/i.test(fullName)) return;

    const headline = pick(el, ['.entity-result__primary-subtitle', '[class*="primary-subtitle"]']);
    const location = pick(el, ['.entity-result__secondary-subtitle', '[class*="secondary-subtitle"]']);

    // Parse "Title at Company" / "Title @ Company" / "Title di Company".
    let title = headline;
    let companyName = "";
    const m = headline.match(/^(.*?)\s+(?:at|@|di)\s+(.+)$/i);
    if (m) {
      title = clean(m[1]);
      companyName = clean(m[2]);
    }
    if (companyName) companies.set(companyName.toLowerCase(), companyName);

    people.push({
      fullName,
      title: title || undefined,
      companyName: companyName || undefined,
      location: location || undefined,
      source: "linkedin-extension",
    });
  });

  return {
    people,
    companies: [...companies.values()].map((name) => ({ name, source: "linkedin-extension" })),
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "SCAN_PEOPLE") {
    try {
      sendResponse({ ok: true, ...scrapePeople() });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  }
  return true;
});
