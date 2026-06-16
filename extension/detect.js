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

  // Generic-site Stage-2 enrich (doc 45) — for Google results the enrich target is
  // the company's OWN website (an arbitrary domain), where platforms.js/content.js
  // are NOT injected but detect.js (https://*/*) is. We answer SCAN_ENRICH with the
  // page's visible text so the background can DeepSeek-analyze it. Known platform
  // hosts are skipped here (platforms.js handles those) to avoid a double response.
  const KNOWN_HOST = /(^|\.)(linkedin|google|instagram|tiktok|tokopedia|shopee)\./i;
  function capturePageText() {
    const root = document.querySelector("main") || document.body;
    let t = (root.innerText || "").replace(/\n{2,}/g, "\n").trim();
    t = t.replace(/\b(Masuk|Daftar|Login|Sign up|Sign in|Subscribe|Cookie|Accept all)\b/gi, "");
    return t.slice(0, 8000);
  }
  async function autoScroll(steps, delay) {
    for (let i = 0; i < steps; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, delay));
    }
    window.scrollTo(0, 0);
  }
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg && msg.type === "SCAN_ENRICH" && !KNOWN_HOST.test(location.hostname)) {
      (async () => {
        try {
          await autoScroll(4, 350);
          sendResponse({ ok: true, platform: "site", url: location.href.split("?")[0], pageText: capturePageText() });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true; // keep the channel open for the async sendResponse
    }
    return false; // not ours → let other listeners (platforms.js) handle it
  });
})();
