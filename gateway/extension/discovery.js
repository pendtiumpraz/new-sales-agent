// discovery.js — multi-platform profile extractor for Maira Sales.
// Berjalan di LinkedIn, Instagram, Facebook, TikTok, Shopee, Google Search.
// Ekstrak data publik/pribadi dari DOM, tampilkan floating widget untuk simpan ke Maira.
//
// ⚠️ Platform DOM berubah-ubah. Semua selector ada di EXTRACTORS di bawah.
// Kalo satu platform error, jangan ngaruh ke platform lain.
// Best-effort: kalo data gak ketemu, tetep capture URL + nama minimal.

const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
const text = (sel, root = document) => clean(root.querySelector(sel)?.textContent || "");

// ---------- Platform Detection ----------
const PLATFORM_MATCHERS = {
  linkedin: () => /linkedin\.com/.test(location.hostname),
  instagram: () => /instagram\.com/.test(location.hostname),
  facebook: () => /facebook\.com/.test(location.hostname),
  tiktok: () => /tiktok\.com/.test(location.hostname),
  shopee: () => /shopee\.co\.id/.test(location.hostname),
  google: () => /google\.(com|co\.id)/.test(location.hostname) && location.pathname.includes("/search"),
};

// ---------- Platform Labels ----------
const PLATFORM_LABELS = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  shopee: "Shopee",
  google: "Google Search",
};

// ---------- Extractors ----------
const EXTRACTORS = {
  linkedin: {
    name: "LinkedIn",
    color: "#0a66c2",
    isProfile: () => /\/in\/[^/]+/.test(location.pathname) || /\/company\/[^/]+/.test(location.pathname),
    extract() {
      const fullName = text("main h1") || text("h1");
      if (!fullName) return null;
      const isCompany = /\/company\//.test(location.pathname);
      return {
        fullName,
        title: !isCompany ? text("main .text-body-medium.break-words") || text(".text-body-medium.break-words") : undefined,
        location: !isCompany ? text("main .text-body-small.inline.t-black--light.break-words") : undefined,
        companyName: isCompany ? fullName : undefined,
        linkedinUrl: location.href.split("?")[0],
        source: "linkedin",
        ...(isCompany ? { leadType: "b2b_partner" } : { leadType: "b2b_partner" }),
      };
    },
  },

  instagram: {
    name: "Instagram",
    color: "#e1306c",
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

  facebook: {
    name: "Facebook",
    color: "#1877f2",
    isProfile() {
      const seg = location.pathname.split("/").filter(Boolean);
      return seg.length >= 1 && seg[0] !== "login" && seg[0] !== "settings";
    },
    extract() {
      const pageName = text("h1") || text('[data-testid="page_title"]') || text('[data-pageheader] h1') || 
        document.title.replace(/ - Facebook$/, "").replace(/ \| Facebook$/, "").trim() || null;
      if (!pageName) return null;

      const about = text('[data-testid="page_info"] p') || text('[data-pageheader] .x1e56ztr') || undefined;
      const followersEl = document.querySelector('[data-testid="page_info"] span, [data-testid="page_info"] .xi81zsa');
      const followers = followersEl?.textContent?.match(/[\d,.KMBkmb]+/)?.[0] || undefined;

      return {
        fullName: pageName,
        about: about?.slice(0, 400) || undefined,
        companyName: pageName,
        facebookUrl: location.href.split("?")[0],
        source: "facebook",
        leadType: "b2c_customer",
      };
    },
  },

  tiktok: {
    name: "TikTok",
    color: "#000000",
    isProfile() {
      const seg = location.pathname.split("/").filter(Boolean);
      return seg[0]?.startsWith("@") || location.pathname.includes("/@");
    },
    extract() {
      const username = location.pathname.match(/@([^/?]+)/)?.[1] || "";
      if (!username) return null;

      const fullName = text('h1[data-e2e="user-title"]') || text('[data-e2e="user-title"]') || 
        text(".userTitle") || `@${username}`;
      const bio = text('h2[data-e2e="user-subtitle"]') || text('[data-e2e="user-subtitle"]') || 
        text(".userSubtitle") || undefined;
      const countEls = document.querySelectorAll('[data-e2e*="count"], [class*="count"]');
      let followers, following, likes;
      countEls.forEach((el) => {
        const t = clean(el.textContent || "");
        const label = el.getAttribute("data-e2e") || el.parentElement?.getAttribute("data-e2e") || "";
        if (label.includes("follower") || label.includes("Follower")) followers = t;
        if (label.includes("following") || label.includes("Following")) following = t;
        if (label.includes("heart") || label.includes("Heart") || label.includes("like")) likes = t;
      });
      const url = `https://www.tiktok.com/@${username}`;
      return {
        fullName,
        about: bio || undefined,
        sourceUrl: url,
        socials: { tiktok: url },
        source: "tiktok",
        leadType: "b2c_customer",
      };
    },
  },

  shopee: {
    name: "Shopee",
    color: "#ee4d2d",
    isProfile() {
      return location.pathname.includes("/product/") || location.pathname.includes("/shop/") || 
        location.pathname.includes("/search");
    },
    extract() {
      const items = [];
      const productCards = document.querySelectorAll('[data-sqe="item"], .shopee-search-item-result__item, [class*="product-card"]');
      productCards.forEach((card) => {
        const nameEl = card.querySelector('[data-sqe="name"], ._10Wl-1, [class*="product-name"]');
        const priceEl = card.querySelector('[data-sqe="price"], ._1xk7Tw, [class*="price"]');
        const linkEl = card.querySelector('a[href*="shopee"]');
        if (nameEl) {
          items.push({
            name: clean(nameEl.textContent || ""),
            price: clean(priceEl?.textContent || ""),
            url: linkEl?.href || undefined,
          });
        }
      });

      // If single product page
      const productName = text('[data-sqe="product-name"], .flex.items-start h1, [class*="product-name"]') || 
        document.title.replace(/ - Shopee Indonesia$/, "").trim();
      const price = text('[data-sqe="price"], .flex.items-start [class*="price"]') || undefined;

      return {
        fullName: productName || `Produk Shopee — ${items.length} item ditemukan`,
        about: price ? `Harga: ${price}` : undefined,
        sourceUrl: location.href,
        items,
        source: "shopee",
        leadType: "b2c_customer",
      };
    },
  },

  google: {
    name: "Google Search",
    color: "#4285f4",
    isProfile() {
      return location.pathname.includes("/search");
    },
    extract() {
      const q = new URLSearchParams(location.search).get("q") || "";
      const results = [];
      document.querySelectorAll(".MjjYud, .g, [data-hveid]").forEach((card) => {
        const titleEl = card.querySelector("h3");
        const linkEl = card.querySelector('a[href^="http"]');
        const snippetEl = card.querySelector(".VwiC3b, .lEBKkf, span.aCOpRe");
        if (titleEl && linkEl) {
          results.push({
            title: clean(titleEl.textContent || ""),
            url: linkEl.href,
            snippet: clean(snippetEl?.textContent || ""),
          });
        }
      });
      return {
        fullName: `Google: ${q}`,
        about: `${results.length} hasil ditemukan`,
        sourceUrl: location.href,
        query: q,
        items: results.slice(0, 10),
        source: "google",
        leadType: "b2b_partner",
      };
    },
  },
};

// ---------- Auto-detect current platform ----------
function detectPlatform() {
  for (const [key, matcher] of Object.entries(PLATFORM_MATCHERS)) {
    if (matcher()) return key;
  }
  return null;
}

// ---------- Floating Widget ----------
let widget, platformSelect, platformLabel, analyzeBtn, saveBtn, statusEl, analysisEl;
let lastAnalysis = null;

function setStatus(msg, kind) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  statusEl.style.color = kind === "ok" ? "#bbf7d0" : kind === "err" ? "#fecaca" : kind === "warn" ? "#fde68a" : "#e0e7ff";
}

const fmtType = (t) =>
  t === "b2b_partner" ? "B2B partner" : t === "b2c_customer" ? "B2C customer" : "Belum jelas";

function getCurrentExtractor() {
  const p = platformSelect?.value || detectPlatform();
  return p ? EXTRACTORS[p] : null;
}

function mkBtn(label, primary) {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText =
    "cursor:pointer;border-radius:999px;padding:8px 13px;font-weight:600;font-size:12px;" +
    (primary
      ? "border:0;color:#fff;background:linear-gradient(90deg,#3b82f6,#6366f1);box-shadow:0 6px 18px -6px rgba(59,130,246,.7);"
      : "border:1px solid rgba(255,255,255,.5);color:#fff;background:rgba(15,23,42,.85);");
  return b;
}

function renderAnalysis(a) {
  if (!analysisEl) return;
  analysisEl.textContent = "";
  analysisEl.style.display = "block";
  const pct = Math.round((a.leadScore ?? 0) * 100);
  const head = document.createElement("div");
  head.style.cssText = "font-weight:700;margin-bottom:2px;";
  head.textContent = `🤖 ${fmtType(a.leadType)} · ${pct}%`;
  const reason = document.createElement("div");
  reason.style.cssText = "opacity:.9;font-size:11px;";
  reason.textContent = a.leadReason || "";
  analysisEl.append(head, reason);
}

function mountWidget() {
  if (widget) return;
  widget = document.createElement("div");
  widget.id = "maira-discovery-widget";
  widget.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;flex-direction:column;gap:5px;align-items:flex-end;font:12px/1.3 system-ui,sans-serif;";

  // Platform label
  const detected = detectPlatform();
  platformLabel = document.createElement("div");
  platformLabel.style.cssText = "font-size:11px;opacity:.7;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.5);padding:0 4px;";

  // Platform selector dropdown
  platformSelect = document.createElement("select");
  platformSelect.style.cssText =
    "padding:5px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(15,23,42,.9);color:#fff;font:12px system-ui;cursor:pointer;max-width:180px;";
  for (const [key, ex] of Object.entries(EXTRACTORS)) {
    const opt = document.createElement("option");
    opt.value = key;
    const check = detected === key ? " ✓" : "";
    opt.textContent = `${ex.name}${check}`;
    if (key === detected) opt.selected = true;
    platformSelect.appendChild(opt);
  }
  platformSelect.addEventListener("change", () => {
    const ex = getCurrentExtractor();
    if (ex) {
      const color = ex.color || "#3b82f6";
      analyzeBtn.style.background = `linear-gradient(90deg, ${color}, #6366f1)`;
      analyzeBtn.style.boxShadow = `0 6px 18px -6px ${color}cc`;
      platformLabel.textContent = `Platform: ${ex.name}`;
    }
    lastAnalysis = null;
    if (analysisEl) analysisEl.style.display = "none";
    setStatus("");
  });

  // Analysis display
  analysisEl = document.createElement("div");
  analysisEl.style.cssText =
    "display:none;max-width:220px;background:rgba(15,23,42,.92);color:#fff;padding:7px 10px;border-radius:10px;box-shadow:0 8px 22px -8px rgba(0,0,0,.5);";

  // Status
  statusEl = document.createElement("div");
  statusEl.style.cssText = "max-width:220px;text-align:right;text-shadow:0 1px 2px rgba(0,0,0,.45);";

  // Buttons
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:5px;";
  analyzeBtn = mkBtn("🔍 Analisa", false);
  saveBtn = mkBtn("➕ Simpan", true);
  analyzeBtn.addEventListener("click", onAnalyze);
  saveBtn.addEventListener("click", onSave);

  // Set initial color
  const curEx = getCurrentExtractor();
  if (curEx) {
    const c = curEx.color || "#3b82f6";
    analyzeBtn.style.background = `linear-gradient(90deg, ${c}, #6366f1)`;
    analyzeBtn.style.boxShadow = `0 6px 18px -6px ${c}cc`;
    platformLabel.textContent = `Platform: ${curEx.name}`;
  }

  row.append(analyzeBtn, saveBtn);
  widget.append(platformLabel, platformSelect, analysisEl, statusEl, row);
  document.body.appendChild(widget);
}

// ---------- Background message helpers ----------
function sendBg(type, extra) {
  return new Promise((res) => chrome.runtime.sendMessage({ type, ...extra }, res));
}

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
  const E = getCurrentExtractor();
  const person = E?.extract();
  if (!person || !person.fullName) {
    setStatus("Buka halaman yang bener dulu", "warn");
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
  const E = getCurrentExtractor();
  const person = E?.extract();
  if (!person || !person.fullName) {
    setStatus("Buka halaman yang bener dulu", "warn");
    return;
  }
  saveBtn.disabled = true;
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

// ---------- Auto-monitor ----------
let lastPath = "";

function tick() {
  const p = detectPlatform();
  const onProfile = p !== null;
  if (widget) {
    widget.style.display = onProfile ? "flex" : "none";
    // Update platform selector highlight
    if (p && platformSelect) {
      const ex = EXTRACTORS[p];
      if (ex) {
        Array.from(platformSelect.options).forEach((opt) => {
          opt.textContent = opt.value === p ? `${ex.name} ✓` : EXTRACTORS[opt.value]?.name || opt.value;
        });
      }
    }
  } else if (onProfile) {
    mountWidget();
  }
  // Clear stale on navigation
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    setStatus("");
    lastAnalysis = null;
    if (analysisEl) analysisEl.style.display = "none";
  }
}

// Start monitoring if on a known platform
const detected = detectPlatform();
if (detected) {
  setInterval(tick, 1200);
  tick();
  console.log(`[maira] discovery aktif. Platform: ${PLATFORM_LABELS[detected] || detected}. Buka profil → pilih platform → Simpan.`);
} else {
  console.log("[maira] discovery idle — bukan halaman platform.");
}
