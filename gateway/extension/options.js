// options.js — Multi-platform config buat Maira WA + Discovery
const DEFAULTS = {
  baseUrl: "http://localhost:3100",
  token: "",
  sessionId: "rep:u_rep",
  pollMs: 3000,
  ingestToken: "",
  discoveryWorkspaceId: "",
  "enable-linkedin": true,
  "enable-instagram": true,
  "enable-facebook": true,
  "enable-tiktok": true,
  "enable-shopee": true,
  "enable-google": true,
};
const $ = (id) => document.getElementById(id);

async function load() {
  const c = await chrome.storage.local.get(DEFAULTS);
  $("baseUrl").value = c.baseUrl ?? DEFAULTS.baseUrl;
  $("token").value = c.token ?? "";
  $("sessionId").value = c.sessionId ?? DEFAULTS.sessionId;
  $("pollMs").value = c.pollMs ?? DEFAULTS.pollMs;
  $("ingestToken").value = c.ingestToken ?? "";
  $("discoveryWorkspaceId").value = c.discoveryWorkspaceId ?? "";
  // Platform toggles
  for (const platform of ["linkedin", "instagram", "facebook", "tiktok", "shopee", "google"]) {
    const el = $(`enable-${platform}`);
    if (el) el.checked = c[`enable-${platform}`] !== false;
  }
}

$("save").addEventListener("click", async () => {
  const payload = {
    baseUrl: $("baseUrl").value.trim().replace(/\/$/, ""),
    token: $("token").value.trim(),
    sessionId: $("sessionId").value.trim() || DEFAULTS.sessionId,
    pollMs: Math.max(1500, Number($("pollMs").value) || DEFAULTS.pollMs),
    ingestToken: $("ingestToken").value.trim(),
    discoveryWorkspaceId: $("discoveryWorkspaceId").value.trim(),
  };
  // Platform toggles
  for (const platform of ["linkedin", "instagram", "facebook", "tiktok", "shopee", "google"]) {
    const el = $(`enable-${platform}`);
    if (el) payload[`enable-${platform}`] = el.checked;
  }

  await chrome.storage.local.set(payload);
  const saved = $("saved");
  saved.classList.add("show");
  setTimeout(() => saved.classList.remove("show"), 1500);
});

load();
