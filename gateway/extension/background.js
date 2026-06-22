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
      sendResponse({ ok: false, error: "unknown message type" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true; // keep the channel open for the async response
});
