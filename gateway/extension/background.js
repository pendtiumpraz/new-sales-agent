// background.js (service worker) — the NETWORK side of the bridge. Every call to
// the Maira backend runs here, governed by the extension's host_permissions, so
// it bypasses WA Web's strict CSP (a content-script fetch to our app would be
// blocked). The content script does the DOM; it asks us to do the network.
//
// Implements the gateway contract (docs/wa-gateway-contract.md):
//   poll   → GET  /api/wa/gateway/outbox?sessionId=…
//   ack    → POST /api/wa/gateway/outbox { ackIds }
//   inbound→ POST /api/wa/gateway/inbound { sessionId, from, body, name }

const DEFAULTS = {
  baseUrl: "http://localhost:3100",
  token: "",
  sessionId: "rep:u_rep",
  enabled: false,
  pollMs: 3000,
  // Discovery (LinkedIn/IG → /api/ingest). The ingest token is SEPARATE from the
  // gateway token: use the rep's per-rep token so captured leads auto-assign.
  ingestToken: "",
  discoveryWorkspaceId: "",
};

async function getConfig() {
  const c = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...c };
}

async function api(path, init) {
  const { baseUrl, token } = await getConfig();
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const r = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", "x-wa-gateway-token": token, ...(init?.headers || {}) },
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, json };
}

// ── Heartbeat / connection status ────────────────────────────────────────────
// The app's "Terhubung" state (GET /api/rep/account → connected) is true ONLY when
// the rep's last_seen_at was refreshed within 10 min. Nothing refreshes it unless
// we POST /api/extension/heartbeat with the ingest token — so send one on startup,
// on a periodic alarm, and whenever the popup opens. (MV3 service workers sleep, so
// chrome.alarms wakes us, not a setInterval.)
async function sendHeartbeat() {
  try {
    const cfg = await getConfig();
    if (!cfg.ingestToken) return { ok: false, error: "ingest token belum di-set (Options)" };
    const url = `${cfg.baseUrl.replace(/\/$/, "")}/api/extension/heartbeat`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingest-token": cfg.ingestToken },
      body: JSON.stringify({ version: chrome.runtime.getManifest().version }),
    });
    let json;
    try { json = JSON.parse(await r.text()); } catch { json = {}; }
    await chrome.storage.local.set({
      lastHeartbeatAt: Date.now(),
      connected: !!(r.ok && json && json.connected),
      ...(json && Array.isArray(json.workspaces) ? { repWorkspaces: json.workspaces } : {}),
    });
    return { ok: r.ok && !!(json && json.ok), status: r.status, json };
  } catch (e) {
    await chrome.storage.local.set({ connected: false });
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function ensureHeartbeatAlarm() {
  try { chrome.alarms.create("maira-heartbeat", { periodInMinutes: 4, delayInMinutes: 1 }); } catch (e) {}
}
if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((a) => { if (a && a.name === "maira-heartbeat") sendHeartbeat(); });
}
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(() => { ensureHeartbeatAlarm(); sendHeartbeat(); });
if (chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener(() => { ensureHeartbeatAlarm(); sendHeartbeat(); });
ensureHeartbeatAlarm();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      const cfg = await getConfig();
      if (msg.type === "getConfig") return sendResponse(cfg);
      if (msg.type === "poll") {
        return sendResponse(await api(`/api/wa/gateway/outbox?sessionId=${encodeURIComponent(cfg.sessionId)}`, { method: "GET" }));
      }
      if (msg.type === "ack") {
        return sendResponse(await api(`/api/wa/gateway/outbox`, { method: "POST", body: JSON.stringify({ ackIds: msg.ids || [] }) }));
      }
      if (msg.type === "inbound") {
        return sendResponse(
          await api(`/api/wa/gateway/inbound`, {
            method: "POST",
            body: JSON.stringify({ sessionId: cfg.sessionId, from: msg.from, body: msg.body, name: msg.name }),
          }),
        );
      }
      if (msg.type === "classify") {
        // Discovery AI: metered classify server-side (DeepSeek as provider), key
        // stays server-only. Grounded in the configured workspace's product.
        if (!cfg.ingestToken) return sendResponse({ ok: false, error: "ingest token belum di-set (Options)" });
        const body = { profile: msg.profile, ...(cfg.discoveryWorkspaceId ? { workspaceId: cfg.discoveryWorkspaceId } : {}) };
        return sendResponse(
          await api(`/api/discovery/classify`, {
            method: "POST",
            headers: { "x-ingest-token": cfg.ingestToken },
            body: JSON.stringify(body),
          }),
        );
      }
      if (msg.type === "ingest") {
        // Discovery: send the extracted profile to /api/ingest. Auth is the ingest
        // token (per-rep → auto-assign), NOT the gateway token.
        if (!cfg.ingestToken) return sendResponse({ ok: false, error: "ingest token belum di-set (Options)" });
        const body = {
          origin: "extension",
          ...(cfg.discoveryWorkspaceId ? { workspaceId: cfg.discoveryWorkspaceId } : {}),
          people: [msg.person],
        };
        return sendResponse(
          await api(`/api/ingest`, {
            method: "POST",
            headers: { "x-ingest-token": cfg.ingestToken },
            body: JSON.stringify(body),
          }),
        );
      }
      if (msg.type === "ingestGraph") {
        // Discovery BULK: channel-agnostic Company→People GRAPH sink (post
        // commenters/reactors, SERP, etc.). Same per-rep ingest token as single
        // ingest; `channel` is required by /api/discovery/ingest.
        if (!cfg.ingestToken) return sendResponse({ ok: false, error: "ingest token belum di-set (Options)" });
        const body = {
          origin: "extension",
          channel: msg.channel || "web",
          sourceUrl: msg.sourceUrl || null,
          ...(cfg.discoveryWorkspaceId ? { workspaceId: cfg.discoveryWorkspaceId } : {}),
          companies: msg.companies || [],
          people: msg.people || [],
        };
        return sendResponse(
          await api(`/api/discovery/ingest`, {
            method: "POST",
            headers: { "x-ingest-token": cfg.ingestToken },
            body: JSON.stringify(body),
          }),
        );
      }
      if (msg.type === "heartbeat") {
        return sendResponse(await sendHeartbeat());
      }
      sendResponse({ ok: false, error: "unknown message type" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true; // keep the channel open for the async response
});
