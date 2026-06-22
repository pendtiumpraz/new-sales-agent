// content.js — runs on web.whatsapp.com. Owns the LOOP (persistent while the WA
// tab is open) + all DOM work; delegates network to the background SW (CSP-safe).
//
// ⚠️ The DOM is the fragile surface. WA Web ships obfuscated, frequently-changing
// markup, so every selector lives in SEL below — when WA breaks the bridge, this
// is the one place to fix. The contract loop around it is stable.

const SEL = {
  // The message compose box (footer). data-tab has changed over time → match broadly.
  composeBox: 'footer div[contenteditable="true"][data-tab], footer div[contenteditable="true"]',
  // The chat-search box at the top of the left pane (to open a chat by number).
  searchBox: 'div[contenteditable="true"][data-tab="3"]',
  // Incoming message bubbles.
  messageIn: "div.message-in",
  copyable: ".copyable-text",
  selectableText: "span.selectable-text",
  // Any rendered message row carries data-id="<fromMe>_<chatId>_<msgId>".
  anyRow: "[data-id^='false_'], [data-id^='true_']",
  searchResult: '#pane-side div[role="listitem"], #pane-side div[role="row"]',
};

const seen = new Set();
let cfg = { enabled: false, sessionId: "rep:u_rep", pollMs: 3000 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bare = (jid) => String(jid || "").split("@")[0];
function send(type, extra) {
  return new Promise((res) => chrome.runtime.sendMessage({ type, ...extra }, res));
}

/* --------------------------------- inbound -------------------------------- */
// "false_628xxx@c.us_3EB0…" → { fromMe, chatId, msgId }
function parseRow(row) {
  const dataId =
    row.getAttribute("data-id") || row.querySelector("[data-id]")?.getAttribute("data-id") || "";
  const [fromMe, chatId, msgId] = dataId.split("_");
  if (fromMe !== "false" || !chatId) return null; // our own / malformed
  if (chatId.endsWith("@g.us")) return null; // skip groups (reply-only to 1:1)
  const textEl = row.querySelector(SEL.selectableText);
  const body = textEl ? textEl.innerText.trim() : "";
  const pre = row.querySelector(SEL.copyable)?.getAttribute("data-pre-plain-text") || "";
  // data-pre-plain-text = "[HH:MM, DD/MM/YYYY] Name: "
  const name = (pre.match(/\]\s*([^:]+):/)?.[1] || "").trim() || undefined;
  return { from: bare(chatId), body, name, msgId: msgId || `${chatId}:${body}` };
}

const observer = new MutationObserver((muts) => {
  if (!cfg.enabled) return;
  for (const m of muts)
    for (const node of m.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const rows = node.matches?.(SEL.messageIn) ? [node] : node.querySelectorAll?.(SEL.messageIn) || [];
      for (const row of rows) {
        const r = parseRow(row);
        if (!r || !r.body || seen.has(r.msgId)) continue;
        seen.add(r.msgId);
        send("inbound", { from: r.from, body: r.body, name: r.name });
      }
    }
});
observer.observe(document.body, { childList: true, subtree: true });

/* -------------------------------- outbound -------------------------------- */
function currentChatNumber() {
  const row = document.querySelector(SEL.anyRow);
  return bare((row?.getAttribute("data-id") || "").split("_")[1] || "");
}

async function openChat(number) {
  if (currentChatNumber() === number) return true;
  // Open via the left-pane search. (Reply-only: the contact already messaged us,
  // so they're in the chat list.) Fragile — WA changes the search box often.
  const search = document.querySelector(SEL.searchBox);
  if (!search) return false;
  search.focus();
  document.execCommand("selectAll", false);
  document.execCommand("insertText", false, number);
  await sleep(1200);
  const first = document.querySelector(SEL.searchResult);
  if (first) {
    first.click();
    await sleep(800);
  }
  // Clear the search box for next time.
  search.focus();
  document.execCommand("selectAll", false);
  document.execCommand("delete", false);
  return currentChatNumber() === number;
}

async function typeAndSend(text) {
  const box = document.querySelector(SEL.composeBox);
  if (!box) throw new Error("compose box tidak ketemu");
  box.focus();
  document.execCommand("selectAll", false);
  document.execCommand("insertText", false, text); // Lexical listens to input events
  await sleep(150);
  box.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }),
  );
}

async function doJob(job) {
  if (job.action !== "send") return; // start_session/logout: scan QR in the tab manually
  const p = job.payload || {};
  const number = bare(String(p.to));
  if (!(await openChat(number))) throw new Error(`gagal buka chat ${number}`);
  // delayMs ≈ "type for a beat". Focusing + waiting also emits typing presence.
  await sleep(Math.min(Math.max(0, Number(p.delayMs) || 0), 12000));
  await typeAndSend(p.body || "");
}

/* ---------------------------------- loop ---------------------------------- */
async function loop() {
  try {
    cfg = (await send("getConfig")) || cfg;
    if (cfg.enabled) {
      const res = await send("poll");
      const jobs = res?.json?.data || [];
      for (const job of jobs) {
        try {
          await doJob(job);
          await send("ack", { ids: [job.id] }); // ack per-job → no double-send on reload
        } catch (e) {
          console.warn("[maira] job gagal:", e.message); // un-acked → retried next tick
        }
      }
    }
  } catch (e) {
    console.warn("[maira] loop error:", e.message);
  }
  setTimeout(loop, Math.max(1500, cfg.pollMs || 3000));
}

loop();
console.log("[maira] WA Bridge content script aktif. Atur backend di Options, lalu Enable di popup.");
