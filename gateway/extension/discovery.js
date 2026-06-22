// discovery.js — runs on LinkedIn + Instagram profile pages. The "extract/profile"
// half of the architecture: the extension reads a profile behind the rep's OWN
// login (the server can't log in), turns the DOM into a structured lead, and sends
// it to /api/ingest tagged to the configured workspace + attributed to the rep
// (per-rep ingest token). AI classification stays server-side (or a future
// in-extension step) — this is pure extraction.
//
// ⚠️ Platform DOM is obfuscated and changes often. All selectors live in EXTRACTORS
// below — that's the one place to fix when a platform breaks extraction. Everything
// is best-effort with URL-based fallbacks, so a missing node never throws: worst
// case you still capture name + profile URL.

const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
const text = (sel, root = document) => clean(root.querySelector(sel)?.textContent || "");

function linkedinCanonical() {
  const m = location.pathname.match(/\/in\/([^/]+)/);
  return m ? `https://www.linkedin.com/in/${m[1]}/` : location.href.split("?")[0];
}

const EXTRACTORS = {
  linkedin: {
    isProfile: () => /\/in\/[^/]+/.test(location.pathname),
    extract() {
      const fullName = text("main h1") || text("h1");
      if (!fullName) return null;
      const title = text("main .text-body-medium.break-words") || text(".text-body-medium.break-words");
      const location_ = text("main .text-body-small.inline.t-black--light.break-words");
      let about;
      try {
        const aboutSection = document.querySelector("#about")?.closest("section");
        about = clean(aboutSection?.querySelector(".inline-show-more-text, .display-flex.full-width")?.textContent || "").slice(0, 600) || undefined;
      } catch {
        /* best-effort */
      }
      // company from headline "Role at/di/@ Company"
      const m = title.match(/\b(?:at|@|di)\s+(.+)$/i);
      const companyName = m ? clean(m[1]) : undefined;
      return {
        fullName,
        title: title || undefined,
        location: location_ || undefined,
        about,
        companyName,
        linkedinUrl: linkedinCanonical(),
        source: "linkedin",
        leadType: "b2b_partner",
      };
    },
  },
  instagram: {
    isProfile() {
      const seg = location.pathname.split("/").filter(Boolean);
      const first = seg[0] || "";
      return seg.length === 1 && !["p", "reel", "reels", "explore", "direct", "stories", "accounts"].includes(first);
    },
    extract() {
      const username = location.pathname.split("/").filter(Boolean)[0] || "";
      if (!username) return null;
      const fullName = text("header section h2") || text("header section h1") || username;
      const bio = clean(document.querySelector("header section")?.innerText || "").slice(0, 400);
      const website = document.querySelector('header a[href^="http"]')?.getAttribute("href") || undefined;
      const url = `https://www.instagram.com/${username}/`;
      return {
        fullName,
        about: bio || undefined,
        sourceUrl: url,
        socials: { instagram: url, ...(website ? { website } : {}) },
        source: "instagram",
        leadType: "b2c_customer",
      };
    },
  },
};

const host = location.hostname;
const platform = host.includes("linkedin") ? "linkedin" : host.includes("instagram") ? "instagram" : null;
const E = platform ? EXTRACTORS[platform] : null;

function sendBg(type, extra) {
  return new Promise((res) => chrome.runtime.sendMessage({ type, ...extra }, res));
}

/* ----------------------------- floating widget ---------------------------- */
let widget, analyzeBtn, saveBtn, statusEl, analysisEl;
let lastAnalysis = null; // { url, leadType, leadScore, leadReason, profileConfidence }

function setStatus(msg, kind) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  statusEl.style.color = kind === "ok" ? "#bbf7d0" : kind === "err" ? "#fecaca" : kind === "warn" ? "#fde68a" : "#e0e7ff";
}

const fmtType = (t) => (t === "b2b_partner" ? "B2B partner" : t === "b2c_customer" ? "B2C customer" : "Belum jelas");

// Build with textContent (NOT innerHTML) — the reason is model output over scraped
// (untrusted) text, so never inject it as HTML.
function renderAnalysis(a) {
  if (!analysisEl) return;
  analysisEl.textContent = "";
  analysisEl.style.display = "block";
  const pct = Math.round((a.leadScore ?? 0) * 100);
  const head = document.createElement("div");
  head.style.cssText = "font-weight:700;margin-bottom:2px;";
  head.textContent = `🤖 ${fmtType(a.leadType)} · ${pct}%`;
  const reason = document.createElement("div");
  reason.style.cssText = "opacity:.9;";
  reason.textContent = a.leadReason || "";
  analysisEl.append(head, reason);
}

function mkBtn(label, primary) {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText =
    "cursor:pointer;border-radius:999px;padding:9px 14px;font-weight:600;font-size:13px;" +
    (primary
      ? "border:0;color:#fff;background:linear-gradient(90deg,#3b82f6,#6366f1);box-shadow:0 6px 18px -6px rgba(59,130,246,.7);"
      : "border:1px solid rgba(255,255,255,.5);color:#fff;background:rgba(15,23,42,.85);");
  return b;
}

function mountWidget() {
  if (widget) return;
  widget = document.createElement("div");
  widget.style.cssText =
    "position:fixed;right:18px;bottom:18px;z-index:2147483647;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:13px/1.35 system-ui,sans-serif;";
  analysisEl = document.createElement("div");
  analysisEl.style.cssText =
    "display:none;max-width:240px;background:rgba(15,23,42,.92);color:#fff;padding:8px 11px;border-radius:12px;box-shadow:0 8px 22px -8px rgba(0,0,0,.5);";
  statusEl = document.createElement("div");
  statusEl.style.cssText = "max-width:240px;text-align:right;text-shadow:0 1px 2px rgba(0,0,0,.45);";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:6px;";
  analyzeBtn = mkBtn("🔍 Analisa", false);
  saveBtn = mkBtn("➕ Simpan", true);
  analyzeBtn.addEventListener("click", onAnalyze);
  saveBtn.addEventListener("click", onSave);
  row.append(analyzeBtn, saveBtn);
  widget.append(analysisEl, statusEl, row);
  document.body.appendChild(widget);
}

// Metered DeepSeek classify on the server (key-safe). Returns the ingest-shaped
// fields or null on failure.
async function classifyPerson(person) {
  const res = await sendBg("classify", {
    profile: {
      fullName: person.fullName,
      title: person.title,
      company: person.companyName,
      location: person.location,
      about: person.about,
    },
  });
  if (res?.ok && res.json?.ok) {
    return {
      leadType: res.json.leadType,
      leadScore: res.json.leadScore,
      leadReason: res.json.leadReason,
      profileConfidence: res.json.profileConfidence,
    };
  }
  return null;
}

async function onAnalyze() {
  const person = E?.extract();
  if (!person || !person.fullName) {
    setStatus("Buka halaman profil dulu", "warn");
    return;
  }
  analyzeBtn.disabled = true;
  setStatus("Menganalisa (DeepSeek)…");
  const a = await classifyPerson(person);
  analyzeBtn.disabled = false;
  if (a) {
    lastAnalysis = { url: location.href, ...a };
    renderAnalysis(a);
    setStatus("");
  } else {
    setStatus("Analisa gagal — cek token/credit di Options", "err");
  }
}

async function onSave() {
  const person = E?.extract();
  if (!person || !person.fullName) {
    setStatus("Buka halaman profil dulu", "warn");
    return;
  }
  saveBtn.disabled = true;
  // Reuse a fresh analysis for this exact profile; otherwise classify first so the
  // saved lead carries the AI read (and the server skips its fallback classify).
  let a = lastAnalysis && lastAnalysis.url === location.href ? lastAnalysis : null;
  if (!a) {
    setStatus("Menganalisa…");
    a = await classifyPerson(person);
    if (a) {
      lastAnalysis = { url: location.href, ...a };
      renderAnalysis(a);
    }
  }
  setStatus("Menyimpan…");
  const merged = a
    ? { ...person, leadType: a.leadType, leadScore: a.leadScore, leadReason: a.leadReason, profileConfidence: a.profileConfidence }
    : person;
  const res = await sendBg("ingest", { person: merged });
  saveBtn.disabled = false;
  if (res?.ok && res.json?.ok) {
    const enriched = res.json.existingEnriched?.length ? " · sudah ada (di-update)" : "";
    setStatus(`Tersimpan ✓${a ? " · " + fmtType(a.leadType) : ""}${enriched}`, "ok");
  } else {
    setStatus(`Gagal: ${res?.json?.error || res?.error || res?.status || "cek token & workspace di Options"}`, "err");
  }
}

// LinkedIn/IG are SPAs (URL changes without reload) — poll to show the button only
// on profile pages and clear stale status on navigation.
let lastPath = "";
function tick() {
  const onProfile = !!E && E.isProfile();
  if (widget) widget.style.display = onProfile ? "flex" : "none";
  else if (onProfile) mountWidget();
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    setStatus("");
    lastAnalysis = null;
    if (analysisEl) analysisEl.style.display = "none";
  }
}
if (platform) {
  setInterval(tick, 1200);
  tick();
  console.log(`[maira] discovery aktif di ${platform}. Buka profil → "Simpan ke Maira".`);
}
