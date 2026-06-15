// Service worker — buffers scraped leads in chrome.storage.local and flushes them
// to the Maira Sales /api/ingest endpoint on a rate-limited, jittered schedule
// with a daily cap. Aggressive posture requires explicit consent. (doc 21/25)

const DEFAULTS = {
  apiBase: "http://localhost:3000",
  token: "",
  dailyCap: 200,
  postureMode: "compliant", // compliant | balanced | aggressive
  consent: false,
  paused: false,
};

async function cfg() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}
async function state() {
  return { buffer: [], companies: [], sentToday: 0, dayStamp: "", ...(await chrome.storage.local.get(["buffer", "companies", "sentToday", "dayStamp"])) };
}
const today = () => new Date().toISOString().slice(0, 10);

async function addLeads(people, companies) {
  const st = await state();
  const seen = new Set(st.buffer.map((p) => `${p.fullName}|${p.companyName || ""}`.toLowerCase()));
  for (const p of people) {
    const k = `${p.fullName}|${p.companyName || ""}`.toLowerCase();
    if (!seen.has(k)) { seen.add(k); st.buffer.push(p); }
  }
  const cseen = new Set(st.companies.map((c) => c.name.toLowerCase()));
  for (const c of companies) {
    if (!cseen.has(c.name.toLowerCase())) { cseen.add(c.name.toLowerCase()); st.companies.push(c); }
  }
  await chrome.storage.local.set({ buffer: st.buffer, companies: st.companies });
  return st.buffer.length;
}

async function flush() {
  const c = await cfg();
  if (c.paused || !c.token || !c.apiBase) return;
  if (c.postureMode === "aggressive" && !c.consent) return; // consent-gated

  let st = await state();
  if (st.dayStamp !== today()) {
    st.sentToday = 0; st.dayStamp = today();
    await chrome.storage.local.set({ sentToday: 0, dayStamp: today() });
  }
  if (st.sentToday >= c.dailyCap) return;
  if (st.buffer.length === 0 && st.companies.length === 0) return;

  const people = st.buffer.slice(0, 10);
  const companies = st.companies.slice(0, 10);
  try {
    const res = await fetch(c.apiBase.replace(/\/$/, "") + "/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-token": c.token },
      body: JSON.stringify({ origin: "extension", people, companies }),
    });
    if (res.ok) {
      await chrome.storage.local.set({
        buffer: st.buffer.slice(people.length),
        companies: st.companies.slice(companies.length),
        sentToday: st.sentToday + people.length,
      });
    }
  } catch {
    // leave in buffer; retry on the next alarm
  }
}

function scheduleNext() {
  // Jittered 60–120s — human-paced (anti-ban, doc 21).
  chrome.alarms.create("flush", { delayInMinutes: 1 + Math.random() });
}
chrome.runtime.onInstalled.addListener(scheduleNext);
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(scheduleNext);
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === "flush") { await flush(); scheduleNext(); }
});

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg && msg.type === "BUFFER_LEADS") {
    addLeads(msg.people || [], msg.companies || []).then((n) => sendResponse({ ok: true, buffered: n }));
    return true;
  }
  if (msg && msg.type === "FLUSH_NOW") {
    flush().then(() => sendResponse({ ok: true }));
    return true;
  }
});
