// options.js — persist config to chrome.storage.local (read by background.js).
const DEFAULTS = { baseUrl: "http://localhost:3100", token: "", sessionId: "rep:u_rep", pollMs: 3000 };
const $ = (id) => document.getElementById(id);

async function load() {
  const c = await chrome.storage.local.get(DEFAULTS);
  $("baseUrl").value = c.baseUrl ?? DEFAULTS.baseUrl;
  $("token").value = c.token ?? "";
  $("sessionId").value = c.sessionId ?? DEFAULTS.sessionId;
  $("pollMs").value = c.pollMs ?? DEFAULTS.pollMs;
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    baseUrl: $("baseUrl").value.trim().replace(/\/$/, ""),
    token: $("token").value.trim(),
    sessionId: $("sessionId").value.trim() || DEFAULTS.sessionId,
    pollMs: Math.max(1500, Number($("pollMs").value) || DEFAULTS.pollMs),
  });
  const saved = $("saved");
  saved.classList.add("show");
  setTimeout(() => saved.classList.remove("show"), 1500);
});

load();
