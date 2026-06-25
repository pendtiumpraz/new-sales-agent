// popup.js — Multi-platform popup untuk Maira WA + Discovery
const $ = (id) => document.getElementById(id);

function render(cfg) {
  $("enabled").checked = !!cfg.enabled;
  $("baseUrl").textContent = cfg.baseUrl || "—";
  $("sessionId").textContent = cfg.sessionId || "—";
  $("state").textContent = !!cfg.enabled ? "ON" : "OFF";
  $("state").className = "pill " + (!!cfg.enabled ? "on" : "off");

  // Discovery status
  const hasIngest = !!cfg.ingestToken;
  const hasWs = !!cfg.discoveryWorkspaceId;
  $("discoveryStatus").textContent = hasIngest
    ? `✅ Siap simpan${hasWs ? " → workspace: " + cfg.discoveryWorkspaceId : " → pool tenant"}`
    : "⚠️ Set ingest token di Pengaturan";
}

async function load() {
  const cfg = await chrome.runtime.sendMessage({ type: "getConfig" });
  render(cfg);
}

$("enabled").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ enabled: e.target.checked });
  const cfg = await chrome.runtime.sendMessage({ type: "getConfig" });
  render(cfg);
  $("status").textContent = e.target.checked
    ? "Aktif — buka tab web.whatsapp.com biar bridge jalan."
    : "Nonaktif.";
});

$("opts").addEventListener("click", () => chrome.runtime.openOptionsPage());

$("test").addEventListener("click", async () => {
  $("status").textContent = "Mengetes…";
  const res = await chrome.runtime.sendMessage({ type: "poll" });
  if (res?.ok) {
    const n = res.json?.data?.length ?? 0;
    $("status").textContent = `OK ✓ backend nyambung — ${n} job pending di outbox.`;
  } else {
    $("status").textContent = `Gagal: ${res?.status || ""} ${res?.error || "cek backend & token di Pengaturan"}`;
  }
});

load();
