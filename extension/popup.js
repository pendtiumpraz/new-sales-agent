const FIELDS = ["apiBase", "token", "postureMode", "dailyCap", "consent", "paused"];
const $ = (id) => document.getElementById(id);

async function load() {
  const cfg = await chrome.storage.local.get(FIELDS);
  $("apiBase").value = cfg.apiBase ?? "";
  $("token").value = cfg.token ?? "";
  $("postureMode").value = cfg.postureMode ?? "compliant";
  $("dailyCap").value = cfg.dailyCap ?? 200;
  $("consent").checked = !!cfg.consent;
  $("paused").checked = !!cfg.paused;
  toggleConsent();
  refreshStats();
}

function toggleConsent() {
  $("consentBox").hidden = $("postureMode").value !== "aggressive";
}

async function save() {
  await chrome.storage.local.set({
    apiBase: $("apiBase").value.trim(),
    token: $("token").value.trim(),
    postureMode: $("postureMode").value,
    dailyCap: Number($("dailyCap").value) || 200,
    consent: $("consent").checked,
    paused: $("paused").checked,
  });
}

async function refreshStats() {
  const st = await chrome.storage.local.get(["buffer", "sentToday"]);
  $("bufCount").textContent = (st.buffer || []).length;
  $("sentCount").textContent = st.sentToday || 0;
}

FIELDS.forEach((id) => $(id).addEventListener("change", () => { save(); toggleConsent(); }));

$("scan").addEventListener("click", async () => {
  await save();
  $("msg").textContent = "Memindai…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/https:\/\/www\.linkedin\.com\/search\//.test(tab.url || "")) {
    $("msg").textContent = "Buka halaman LinkedIn search dulu.";
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: "SCAN_PEOPLE" }, (res) => {
    if (!res || !res.ok) { $("msg").textContent = "Gagal scan (DOM berubah?)."; return; }
    chrome.runtime.sendMessage(
      { type: "BUFFER_LEADS", people: res.people, companies: res.companies },
      (r) => {
        $("msg").textContent = `+${res.people.length} orang / ${res.companies.length} perusahaan → buffer ${r?.buffered ?? "?"}`;
        refreshStats();
      },
    );
  });
});

$("flush").addEventListener("click", async () => {
  await save();
  $("msg").textContent = "Mengirim batch…";
  chrome.runtime.sendMessage({ type: "FLUSH_NOW" }, () => {
    setTimeout(refreshStats, 500);
    $("msg").textContent = "Batch dikirim (rate-limited).";
  });
});

load();
