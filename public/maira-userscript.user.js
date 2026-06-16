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

  // Connect / test koneksi (doc 40) — ping the app so Settings → Extension shows
  // "Terhubung", and confirm the URL + token are correct before crawling.
  function testConnection() {
    const apiBase = (GM_getValue("apiBase", "") || "").replace(/\/$/, "");
    const token = GM_getValue("token", "");
    if (!apiBase || !token) { setConfig(); return; }
    GM_xmlhttpRequest({
      method: "POST",
      url: apiBase + "/api/extension/heartbeat",
      headers: { "Content-Type": "application/json", "x-ingest-token": token },
      data: JSON.stringify({ version: "0.2.0-userscript" }),
      onload: (r) => {
        let ok = false; try { ok = JSON.parse(r.responseText).connected; } catch { /* ignore */ }
        alert(ok ? "✅ Terhubung ke Maira. Hasil crawl akan terkirim." : `❌ Gagal (${r.status}). Cek URL & token.`);
      },
      onerror: () => alert("❌ Network error — cek URL aplikasi."),
    });
  }
  GM_registerMenuCommand("Maira: tes koneksi", testConnection);

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

  // Link-anchored (resilient to LinkedIn class churn): walk every /in/ profile
  // anchor in the results area; name from the anchor, headline/company from the
  // surrounding card. Same logic as the extension's content.js.
  const NAME_NOISE = /^(View|Lihat|LinkedIn Member|Anggota LinkedIn|Status is|•|·|\d(?:st|nd|rd|th)\b|Koneksi|Connection|Mutual|tingkat)/i;
  function profileUrl(href) {
    if (!href) return "";
    try { const u = new URL(href, location.origin); const m = u.pathname.match(/\/in\/[^/?#]+/); return m ? "https://www.linkedin.com" + m[0] : ""; } catch { return ""; }
  }
  function nameFromAnchor(a) {
    const span = a.querySelector('span[aria-hidden="true"]');
    let name = clean(span ? span.textContent : a.textContent);
    name = name.replace(/(’s|'s)\s+profile.*$/i, "").replace(/^View\s+|^Lihat\s+/i, "");
    const half = name.length % 2 === 0 ? name.slice(0, name.length / 2) : "";
    if (half && half === name.slice(name.length / 2)) name = half;
    return name;
  }
  function scrapePeople() {
    const root = document.querySelector("main") || document.body;
    const byUrl = new Map();
    root.querySelectorAll('a[href*="/in/"]').forEach((a) => {
      const url = profileUrl(a.getAttribute("href"));
      if (!url) return;
      const name = nameFromAnchor(a);
      const valid = name && !NAME_NOISE.test(name) && name.length <= 80;
      const existing = byUrl.get(url);
      if (!existing) byUrl.set(url, { fullName: valid ? name : "", anchor: a });
      else if (valid && !existing.fullName) byUrl.set(url, { fullName: name, anchor: a });
    });
    const people = [];
    const companies = new Map();
    byUrl.forEach(({ fullName, anchor }, url) => {
      if (!fullName) return;
      const card = anchor.closest("li") || anchor.closest('div[class*="entity-result"], div[data-chameleon-result-urn]') || anchor.parentElement;
      let headline = "", location = "";
      if (card) {
        const lines = Array.from(card.querySelectorAll('span[aria-hidden="true"], .t-14, .t-12, p, [class*="subtitle"]'))
          .map((n) => clean(n.textContent)).filter((t) => t && t !== fullName && !NAME_NOISE.test(t));
        headline = lines[0] || "";
        location = lines.find((t) => t !== headline && /(,|Indonesia|Jakarta|Surabaya|Bandung|Area)/i.test(t) && t.length < 60) || "";
      }
      let title = headline, companyName = "";
      const m = headline.match(/^(.*?)\s+(?:at|@|di)\s+(.+)$/i);
      if (m) { title = clean(m[1]); companyName = clean(m[2]); }
      if (companyName) companies.set(companyName.toLowerCase(), companyName);
      people.push({ fullName, title: title || undefined, companyName: companyName || undefined, location: location || undefined, linkedinUrl: url, source: "linkedin-userscript" });
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

  // Shared contact-info overlay (doc 40) — only populated for 1st-degree
  // connections who shared it. On a profile page it lives in a modal the user
  // opened (we don't auto-navigate in the userscript); scrape it if present.
  function scrapeContactInfo() {
    const root = document.querySelector(".pv-contact-info") || document.querySelector('section[class*="pv-contact-info"]');
    if (!root) return {};
    const out = {};
    const mail = root.querySelector('a[href^="mailto:"]');
    if (mail) out.email = clean((mail.getAttribute("href") || "").replace(/^mailto:/i, "").split("?")[0]) || clean(mail.textContent);
    const tel = root.querySelector('a[href^="tel:"]');
    if (tel) out.phone = clean((tel.getAttribute("href") || "").replace(/^tel:/i, "")) || clean(tel.textContent);
    for (const a of root.querySelectorAll('a[href^="http"]')) {
      const href = (a.getAttribute("href") || "").trim();
      let host = ""; try { host = new URL(href).hostname; } catch { host = ""; }
      if (host && !/(^|\.)linkedin\.com$/i.test(host)) { out.website = href.replace(/\/$/, ""); break; }
    }
    return out;
  }
  function contactPointsFrom(personName, contact) {
    const points = [];
    for (const channel of ["email", "phone", "website"]) {
      const value = (contact[channel] || "").trim();
      if (value) points.push({ ownerType: "person", personName, channel, value, consentStatus: "unknown", source: "linkedin-overlay" });
    }
    return points;
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
    let payload;
    if (isProfile) {
      const prof = scrapeProfile();
      const cps = contactPointsFrom(prof.fullName, scrapeContactInfo());
      payload = { origin: "extension", people: [prof], companies: [], ...(cps.length ? { contactPoints: cps } : {}) };
    } else {
      payload = { origin: "extension", ...scrapePeople() };
    }
    send(payload, (ok) => {
      btn.textContent = ok ? "✓ Terkirim" : "✗ Gagal";
      setTimeout(() => (btn.textContent = "➕ Maira"), 2200);
    });
  };
  document.body.appendChild(btn);
})();
