const FIELDS = ["apiBase", "token", "query", "maxPages", "postureMode", "dailyCap", "consent", "autoEnrich", "deepseekKey", "searchPlatform"];
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
  $("searchPlatform").value = cfg.searchPlatform ?? "linkedin";
  await loadWorkspaces();
  toggleConsent();
  refreshStatus();
}

const WS_TYPE_LABEL = { lead_gen: "Lead", partner: "Partner", offering: "Penawaran", retention: "Retensi", custom: "Custom" };
async function loadWorkspaces() {
  const { workspaces = [], workspaceId = "" } = await chrome.storage.local.get(["workspaces", "workspaceId"]);
  const sel = $("workspaceSel");
  sel.innerHTML = '<option value="">— Tanpa workspace (pool tenant) —</option>';
  for (const w of workspaces) {
    const o = document.createElement("option");
    o.value = w.id;
    o.textContent = w.type && WS_TYPE_LABEL[w.type] ? `${w.name} · ${WS_TYPE_LABEL[w.type]}` : w.name;
    sel.appendChild(o);
  }
  sel.value = workspaces.some((w) => w.id === workspaceId) ? workspaceId : "";
}
$("workspaceSel").addEventListener("change", () => chrome.storage.local.set({ workspaceId: $("workspaceSel").value }));

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
    searchPlatform: $("searchPlatform").value,
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
      const wsN = Array.isArray(r.workspaces) ? r.workspaces.length : 0;
      $("connStatus").textContent = `✅ Terhubung${r.tenant ? ` (tenant: ${r.tenant})` : ""}.${r.aiKey ? " AI key dari platform." : ""}${wsN ? ` ${wsN} workspace.` : ""} Hasil crawl akan terkirim.`;
      load(); // refresh fields + workspace picker — heartbeat stored the key & workspaces
    } else {
      $("connStatus").textContent = `❌ Gagal: ${(r && r.error) || "cek URL aplikasi & token"}`;
    }
  });
});

// Unified search dispatch — pick a CHANNEL first (LinkedIn is one option, not "Tahap 1").
// Maps each channel to the existing background message so no backend contract changes.
$("startSearch").addEventListener("click", async () => {
  await save();
  const p = $("searchPlatform").value;
  const query = $("query").value.trim();
  const LABEL = {
    linkedin: "LinkedIn", google: "Google", tokopedia: "Tokopedia", shopee: "Shopee",
    instagram: "Instagram", tiktok: "TikTok", duckduckgo: "internet (DuckDuckGo)", ai: "AI Websearch",
  };
  $("status").textContent = `Cari di ${LABEL[p] || p}…`;
  let msg;
  if (p === "linkedin") msg = { type: "START_SEARCH" };
  else if (p === "ai") msg = { type: "AI_SEARCH", query };
  else if (p === "duckduckgo") msg = { type: "WEB_SEARCH", query };
  else msg = { type: "PLATFORM_SEARCH", platform: p, query };
  chrome.runtime.sendMessage(msg, () => setTimeout(refreshStatus, 1000));
});

$("startEnrich").addEventListener("click", async () => {
  await save();
  $("status").textContent = "Enrich profil LinkedIn…";
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
