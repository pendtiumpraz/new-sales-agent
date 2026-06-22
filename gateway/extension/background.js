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
      sendResponse({ ok: false, error: "unknown message type" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true; // keep the channel open for the async response
});
