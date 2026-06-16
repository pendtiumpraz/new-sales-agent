// Install-detection handshake (doc 40). Runs on the app's OWN pages and answers
// a page-initiated ping, so Settings → Extension can show "Terpasang di browser
// ini" even before the ingest token is configured (vs the server-side heartbeat
// which proves "Terhubung"). This script reads NOTHING from the page — it only
// announces its presence and replies to an explicit MAIRA ping.
(function () {
  const VERSION = (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || "0";

  function reply() {
    window.postMessage({ source: "maira-ext", type: "PONG", version: VERSION }, "*");
  }

  // Answer the app page's ping.
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (d && d.source === "maira-app" && d.type === "PING") reply();
  });

  // Also announce on load, in case the page mounted its listener before us.
  window.postMessage({ source: "maira-ext", type: "HELLO", version: VERSION }, "*");
})();
