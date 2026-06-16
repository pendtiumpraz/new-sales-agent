// ==UserScript==
// @name         Maira Sales — LinkedIn Collector
// @namespace    https://mairasales.com
// @version      0.2.0
// @description  Kirim lead LinkedIn (search + profil/track record) ke aplikasi Maira Sales — berjalan di sesi login Anda sendiri, tanpa simpan kredensial.
// @author       Maira Sales
// @match        https://www.linkedin.com/search/*
// @match        https://www.linkedin.com/in/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-idle
// ==/UserScript==

/* Versi userscript Tampermonkey dari extension. Lebih ringkas: scrape halaman
 * yang sedang dibuka → kirim ke /api/ingest. Tidak ada RPA otomatis multi-halaman
 * (itu pakai extension). Selector best-effort — sama seperti content.js. */
(function () {
  "use strict";

  // ── config (via Tampermonkey storage) ──
  function setConfig() {
    const apiBase = prompt("URL aplikasi Maira (mis. https://app-anda.vercel.app):", GM_getValue("apiBase", ""));
    if (apiBase != null) GM_setValue("apiBase", apiBase.trim());
    const token = prompt("Ingest token (LINKEDIN_INGEST_TOKEN):", GM_getValue("token", ""));
    if (token != null) GM_setValue("token", token.trim());
    alert("Konfigurasi Maira tersimpan.");
  }
  GM_registerMenuCommand("Maira: set config", setConfig);

  // ── scraping helpers ──
  const clean = (s) => (s || "").trim().replace(/\s+/g, " ");
  function pick(el, sels) {
    for (const sel of sels) {
      const n = el.querySelector(sel);
      if (n && clean(n.textContent)) return clean(n.textContent);
    }
    return "";
  }
  function absUrl(href) {
    if (!href) return "";
    try { const u = new URL(href, location.origin); u.search = ""; return u.href.replace(/\/$/, ""); } catch { return ""; }
  }

  function scrapePeople() {
    const containers = document.querySelectorAll(
      'li.reusable-search__result-container, div[data-view-name="search-entity-result-universal-template"], li.entity-result, div.entity-result',
    );
    const people = [];
    const companies = new Map();
    containers.forEach((el) => {
      const linkEl = el.querySelector('a[href*="/in/"]');
      const linkedinUrl = absUrl(linkEl && linkEl.getAttribute("href"));
      const fullName = pick(el, ['.entity-result__title-text a span[aria-hidden="true"]', '.entity-result__title-text a', 'a[href*="/in/"] span[aria-hidden="true"]', 'a[href*="/in/"]']);
      if (!fullName || /^LinkedIn Member$/i.test(fullName)) return;
      const headline = pick(el, ['.entity-result__primary-subtitle', '[class*="primary-subtitle"]']);
      const location = pick(el, ['.entity-result__secondary-subtitle', '[class*="secondary-subtitle"]']);
      let title = headline, companyName = "";
      const m = headline.match(/^(.*?)\s+(?:at|@|di)\s+(.+)$/i);
      if (m) { title = clean(m[1]); companyName = clean(m[2]); }
      // CURRENT/latest company from the highlighted summary line.
      const summary = pick(el, ['.entity-result__summary', '[class*="entity-result__summary"]', '.entity-result__content-summary']);
      const cm = summary.match(/(?:current|saat\s*ini)\s*:?\s*(.+)$/i);
      if (cm) { const cur = clean(cm[1]); const cm2 = cur.match(/^.*?\s+(?:at|@|di)\s+(.+)$/i); const cc = cm2 ? clean(cm2[1]) : cur; if (cc) companyName = cc; }
      if (companyName) companies.set(companyName.toLowerCase(), companyName);
      people.push({ fullName, title: title || undefined, companyName: companyName || undefined, location: location || undefined, linkedinUrl: linkedinUrl || undefined, source: "linkedin-userscript" });
    });
    return { people, companies: [...companies.values()].map((name) => ({ name, source: "linkedin-userscript" })) };
  }

  function scrapeProfile() {
    const fullName = pick(document, ["h1.text-heading-xlarge", "h1"]);
    const headline = pick(document, [".text-body-medium.break-words", ".pv-text-details__left-panel .text-body-medium"]);
    const location = pick(document, [".text-body-small.inline.t-black--light", ".pv-text-details__left-panel .text-body-small"]);
    const about = pick(document, ['section[id*="about" i] .inline-show-more-text', "#about ~ * .inline-show-more-text"]);
    const experience = [];
    const items = document.querySelectorAll('li.artdeco-list__item, li.pvs-list__item--line-separated, div[data-view-name="profile-component-entity"]');
    items.forEach((it) => {
      const t = pick(it, ['span[aria-hidden="true"]', ".t-bold span", ".mr1 span"]);
      const c = pick(it, ['.t-14.t-normal span[aria-hidden="true"]', ".t-14 span"]);
      const p = pick(it, [".pvs-entity__caption-wrapper", '.t-black--light span[aria-hidden="true"]', '[class*="caption"]']);
      if (t) experience.push({ title: t, company: c || undefined, period: p || undefined });
    });
    let title = headline, companyName = (experience[0] && experience[0].company) || "";
    const m = headline.match(/^(.*?)\s+(?:at|@|di)\s+(.+)$/i);
    if (m) { title = clean(m[1]); if (!companyName) companyName = clean(m[2]); }
    return { fullName, title: title || undefined, companyName: companyName || undefined, location: location || undefined, about: about || undefined, experience: experience.slice(0, 12), linkedinUrl: absUrl(location.href || window.location.href), source: "linkedin-userscript" };
  }

  function send(payload, onDone) {
    const apiBase = (GM_getValue("apiBase", "") || "").replace(/\/$/, "");
    const token = GM_getValue("token", "");
    if (!apiBase || !token) { setConfig(); return onDone(false, "config belum diisi"); }
    GM_xmlhttpRequest({
      method: "POST",
      url: apiBase + "/api/ingest",
      headers: { "Content-Type": "application/json", "x-ingest-token": token },
      data: JSON.stringify(payload),
      onload: (r) => onDone(r.status >= 200 && r.status < 300, r.responseText),
      onerror: () => onDone(false, "network error"),
    });
  }

  // ── floating button ──
  const btn = document.createElement("button");
  btn.textContent = "➕ Maira";
  btn.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:99999;background:#FB5E3B;color:#fff;border:0;border-radius:999px;padding:10px 16px;font:600 13px system-ui;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)";
  btn.onclick = () => {
    btn.textContent = "Mengirim…";
    const isProfile = /\/in\//.test(location.pathname);
    const payload = isProfile
      ? { origin: "extension", people: [scrapeProfile()], companies: [] }
      : { origin: "extension", ...scrapePeople() };
    send(payload, (ok) => {
      btn.textContent = ok ? "✓ Terkirim" : "✗ Gagal";
      setTimeout(() => (btn.textContent = "➕ Maira"), 2200);
    });
  };
  document.body.appendChild(btn);
})();
