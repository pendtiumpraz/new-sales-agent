const FIELDS = ["apiBase", "token", "query", "maxPages", "postureMode", "dailyCap", "consent", "autoEnrich", "deepseekKey"];
const $ = (id) => document.getElementById(id);

async function load() {
  const cfg = await chrome.storage.local.get(FIELDS);
  $("apiBase").value = cfg.apiBase ?? "";
  $("token").value = cfg.token ?? "";
  $("query").value = cfg.query ?? "";
  $("maxPages").value = cfg.maxPages ?? 5;
  $("postureMode").value = cfg.postureMode ?? "compliant";
  $("dailyCap").value = cfg.dailyCap ?? 200;
  $("consent").checked = !!cfg.consent;
  $("autoEnrich").checked = cfg.autoEnrich !== false;
  $("deepseekKey").value = cfg.deepseekKey ?? "";
  toggleConsent();
  refreshStatus();
}

function toggleConsent() {
  $("consentBox").hidden = $("postureMode").value !== "aggressive";
}

async function save() {
  await chrome.storage.local.set({
    apiBase: $("apiBase").value.trim(),
    token: $("token").value.trim(),
    query: $("query").value.trim(),
    maxPages: Math.min(100, Math.max(1, Number($("maxPages").value) || 5)),
    postureMode: $("postureMode").value,
    dailyCap: Number($("dailyCap").value) || 200,
    consent: $("consent").checked,
    autoEnrich: $("autoEnrich").checked,
    deepseekKey: $("deepseekKey").value.trim(),
  });
}

async function refreshStatus() {
  chrome.runtime.sendMessage({ type: "STATUS" }, (st) => {
    if (!st || !st.ok) return;
    $("bufCount").textContent = st.buffered ?? 0;
    $("sentCount").textContent = st.sentToday ?? 0;
    if (st.status) $("status").textContent = st.status;
  });
}

FIELDS.forEach((id) => $(id).addEventListener("change", () => { save(); toggleConsent(); }));

$("connect").addEventListener("click", async () => {
  await save();
  $("connStatus").textContent = "Menghubungkan…";
  chrome.runtime.sendMessage({ type: "CONNECT" }, (r) => {
    if (r && r.connected) {
      $("connStatus").textContent = `✅ Terhubung${r.tenant ? ` (workspace: ${r.tenant})` : ""}.${r.aiKey ? " AI key diambil dari platform." : ""} Hasil crawl akan terkirim.`;
      load(); // refresh fields — the heartbeat may have stored the DeepSeek key
    } else {
      $("connStatus").textContent = `❌ Gagal: ${(r && r.error) || "cek URL aplikasi & token"}`;
    }
  });
});

$("aiSearch").addEventListener("click", async () => {
  await save();
  $("status").textContent = "AI websearch (DeepSeek)…";
  chrome.runtime.sendMessage({ type: "AI_SEARCH", query: $("query").value.trim() }, () => setTimeout(refreshStatus, 1000));
});

$("startSearch").addEventListener("click", async () => {
  await save();
  $("status").textContent = "Memulai Tahap 1…";
  chrome.runtime.sendMessage({ type: "START_SEARCH" }, () => setTimeout(refreshStatus, 800));
});

$("startEnrich").addEventListener("click", async () => {
  await save();
  $("status").textContent = "Memulai Tahap 2 (enrich)…";
  chrome.runtime.sendMessage({ type: "START_ENRICH" }, () => setTimeout(refreshStatus, 800));
});

$("flush").addEventListener("click", async () => {
  await save();
  chrome.runtime.sendMessage({ type: "FLUSH_NOW" }, () => setTimeout(refreshStatus, 600));
});

$("stop").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP" }, () => {
    $("status").textContent = "Dihentikan.";
    refreshStatus();
  });
});

// Live status while a run is in progress.
setInterval(refreshStatus, 1500);
load();
