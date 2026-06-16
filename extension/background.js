// Service worker — the RPA orchestrator (doc 21/40). Runs in the user's own
// logged-in LinkedIn session. THREE stages:
//   Stage 1 (runSearch):  RPA over LinkedIn people-search for a job/title query,
//                         page 1..N → buffer name + profile link + headline.
//   Stage 2 (runEnrich):  visit each buffered profile → scrape detail + track
//                         record (experience) → push to the app.
//   Flush:                buffered leads → POST /api/ingest (x-ingest-token),
//                         rate-limited + daily-capped + consent-gated.
// No credentials are ever read or stored — only the page the user can already see.

const DEFAULTS = {
  apiBase: "http://localhost:3000",
  token: "",
  query: "",
  maxPages: 5,
  dailyCap: 200,
  postureMode: "compliant", // compliant | balanced | aggressive
  consent: false,
  paused: false,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a, b) => a + Math.floor(Math.random() * (b - a)); // anti-ban pacing
const today = () => new Date().toISOString().slice(0, 10);

async function cfg() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}
async function state() {
  return {
    buffer: [],
    companies: [],
    sentToday: 0,
    dayStamp: "",
    running: false,
    lastStatus: "",
    ...(await chrome.storage.local.get(["buffer", "companies", "sentToday", "dayStamp", "running", "lastStatus"])),
  };
}
async function setStatus(s) {
  await chrome.storage.local.set({ lastStatus: s });
}

async function addLeads(people, companies) {
  const st = await state();
  const seen = new Set(st.buffer.map((p) => (p.linkedinUrl || `${p.fullName}|${p.companyName || ""}`).toLowerCase()));
  for (const p of people) {
    const k = (p.linkedinUrl || `${p.fullName}|${p.companyName || ""}`).toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      st.buffer.push(p);
    }
  }
  const cseen = new Set(st.companies.map((c) => c.name.toLowerCase()));
  for (const c of companies) {
    if (!cseen.has(c.name.toLowerCase())) {
      cseen.add(c.name.toLowerCase());
      st.companies.push(c);
    }
  }
  await chrome.storage.local.set({ buffer: st.buffer, companies: st.companies });
  return st.buffer.length;
}

// Send a payload to the app. Used by flush + the Stage-2 enrich path.
async function ingest(payload) {
  const c = await cfg();
  if (!c.token || !c.apiBase) return false;
  try {
    const res = await fetch(c.apiBase.replace(/\/$/, "") + "/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-token": c.token },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── RPA navigation helper ───────────────────────────────────────────────────
function waitForComplete(tabId, timeout = 25000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(l);
      resolve(false);
    }, timeout);
    function l(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(t);
        chrome.tabs.onUpdated.removeListener(l);
        resolve(true);
      }
    }
    chrome.tabs.onUpdated.addListener(l);
  });
}
async function navAndScan(tabId, url, type) {
  await chrome.tabs.update(tabId, { url });
  await waitForComplete(tabId);
  await sleep(jitter(2500, 5000)); // let the SPA render + human pacing
  try {
    return await chrome.tabs.sendMessage(tabId, { type });
  } catch {
    return { ok: false, error: "content script not ready" };
  }
}

async function activeLinkedInTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && tab.id ? tab : null;
}

// ── Stage 1: paginated search ───────────────────────────────────────────────
async function runSearch() {
  const c = await cfg();
  if (!c.query) return setStatus("Isi query pencarian dulu.");
  const tab = await activeLinkedInTab();
  if (!tab) return setStatus("Buka 1 tab LinkedIn (sudah login) lalu mulai.");

  await chrome.storage.local.set({ running: true });
  let total = 0;
  for (let page = 1; page <= c.maxPages; page++) {
    if (!(await state()).running) break; // user stopped
    await setStatus(`Stage 1 — halaman ${page}/${c.maxPages}…`);
    const url =
      "https://www.linkedin.com/search/results/people/?keywords=" +
      encodeURIComponent(c.query) +
      "&page=" +
      page;
    const res = await navAndScan(tab.id, url, "SCAN_PEOPLE");
    if (!res || !res.ok) {
      await setStatus(`Stage 1 berhenti di halaman ${page} (${(res && res.error) || "gagal scan"}).`);
      break;
    }
    if (!res.people || res.people.length === 0) {
      await setStatus(`Stage 1 selesai — tidak ada hasil lagi di halaman ${page}.`);
      break;
    }
    total = await addLeads(res.people, res.companies || []);
    await sleep(jitter(3000, 7000)); // pace between pages (anti-ban)
  }
  await chrome.storage.local.set({ running: false });
  await setStatus(`Stage 1 selesai — ${total} lead di buffer. Lanjut "Enrich profil" untuk track record.`);
}

// ── Stage 2: per-profile detail (track record) ──────────────────────────────
async function runEnrich() {
  const c = await cfg();
  if (c.postureMode === "aggressive" && !c.consent) return setStatus("Posture aggressive butuh consent (centang di popup).");
  const tab = await activeLinkedInTab();
  if (!tab) return setStatus("Buka 1 tab LinkedIn (sudah login) lalu mulai.");

  await chrome.storage.local.set({ running: true });
  let st = await state();
  const targets = st.buffer.filter((p) => p.linkedinUrl && !p.enriched).slice(0, c.maxPages * 10);
  let done = 0;
  for (const p of targets) {
    if (!(await state()).running) break;
    await setStatus(`Stage 2 — profil ${done + 1}/${targets.length}…`);
    const res = await navAndScan(tab.id, p.linkedinUrl, "SCAN_PROFILE");
    if (res && res.ok && res.profile) {
      const prof = { ...p, ...res.profile, enriched: true };
      // Push the enriched person (with experience/track record) to the app.
      await ingest({ origin: "extension", people: [prof], companies: prof.companyName ? [{ name: prof.companyName, source: "linkedin-extension" }] : [] });
      // mark enriched in the buffer
      st = await state();
      st.buffer = st.buffer.map((x) => (x.linkedinUrl === p.linkedinUrl ? { ...x, enriched: true } : x));
      await chrome.storage.local.set({ buffer: st.buffer });
      done++;
    }
    await sleep(jitter(4000, 9000)); // slow + human (anti-ban)
  }
  await chrome.storage.local.set({ running: false });
  await setStatus(`Stage 2 selesai — ${done} profil di-enrich + dikirim ke aplikasi.`);
}

// ── Flush buffered leads (Stage 1 list) to the app ──────────────────────────
async function flush() {
  const c = await cfg();
  if (c.paused || !c.token || !c.apiBase) return;
  if (c.postureMode === "aggressive" && !c.consent) return;

  let st = await state();
  if (st.dayStamp !== today()) {
    await chrome.storage.local.set({ sentToday: 0, dayStamp: today() });
    st.sentToday = 0;
  }
  if (st.sentToday >= c.dailyCap) return;
  const people = st.buffer.filter((p) => !p.flushed).slice(0, 10);
  const companies = st.companies.slice(0, 10);
  if (people.length === 0 && companies.length === 0) return;

  if (await ingest({ origin: "extension", people, companies })) {
    st = await state();
    const urls = new Set(people.map((p) => p.linkedinUrl));
    st.buffer = st.buffer.map((p) => (urls.has(p.linkedinUrl) ? { ...p, flushed: true } : p));
    await chrome.storage.local.set({ buffer: st.buffer, companies: st.companies.slice(companies.length), sentToday: st.sentToday + people.length });
  }
}

function scheduleNext() {
  chrome.alarms.create("flush", { delayInMinutes: 1 + Math.random() });
}
chrome.runtime.onInstalled.addListener(scheduleNext);
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(scheduleNext);
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === "flush") {
    await flush();
    scheduleNext();
  }
});

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  (async () => {
    if (!msg) return sendResponse({ ok: false });
    switch (msg.type) {
      case "START_SEARCH":
        runSearch();
        return sendResponse({ ok: true });
      case "START_ENRICH":
        runEnrich();
        return sendResponse({ ok: true });
      case "STOP":
        await chrome.storage.local.set({ running: false });
        return sendResponse({ ok: true });
      case "FLUSH_NOW":
        await flush();
        return sendResponse({ ok: true });
      case "STATUS": {
        const st = await state();
        return sendResponse({ ok: true, buffered: st.buffer.length, sentToday: st.sentToday, running: st.running, status: st.lastStatus });
      }
      // Manual scan from a search page (legacy popup button).
      case "BUFFER_LEADS":
        return sendResponse({ ok: true, buffered: await addLeads(msg.people || [], msg.companies || []) });
      default:
        return sendResponse({ ok: false });
    }
  })();
  return true;
});
