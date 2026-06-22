#!/usr/bin/env node
// WAHA outbound bridge — the only moving part WAHA needs on top of the inbound
// webhook. WAHA can't poll our outbox, so this tiny poller does:
//
//   GET  {APP_URL}/api/wa/gateway/outbox?sessionId=$SESSION_ID   (pull paced jobs)
//   for each "send" job:  startTyping → sleep(delayMs) → sendText → stopTyping
//   POST {APP_URL}/api/wa/gateway/outbox  {ackIds}               (mark done)
//
// Pacing (delayMs + typing) lives here on purpose: the app stays stateless, and
// honoring it is the ban-mitigation that makes the send look human. Pure Node
// 18+ (global fetch), no dependencies. Run next to the WAHA container.
//
// Env (see .env.example):
//   APP_URL           https://your-app.vercel.app   (where Maira runs)
//   WA_GATEWAY_TOKEN  shared secret (same as the app's)
//   SESSION_ID        rep:u_rep   (our session this WAHA number is bound to)
//   WAHA_URL          http://localhost:3000          (WAHA REST base)
//   WAHA_SESSION      default                        (WAHA's session name)
//   WAHA_API_KEY      (optional) WAHA's X-Api-Key if you set WHATSAPP_API_KEY
//   POLL_MS           3000

const cfg = {
  APP_URL: (process.env.APP_URL || "http://localhost:3100").replace(/\/$/, ""),
  TOKEN: process.env.WA_GATEWAY_TOKEN || "",
  SESSION_ID: process.env.SESSION_ID || "rep:u_rep",
  WAHA_URL: (process.env.WAHA_URL || "http://localhost:3000").replace(/\/$/, ""),
  WAHA_SESSION: process.env.WAHA_SESSION || "default",
  WAHA_API_KEY: process.env.WAHA_API_KEY || "",
  POLL_MS: Number(process.env.POLL_MS || 3000),
  // Safety cap so a bad delayMs can't stall the bridge for minutes.
  MAX_DELAY_MS: Number(process.env.MAX_DELAY_MS || 12000),
};

if (!cfg.TOKEN) {
  console.error("[waha-bridge] WA_GATEWAY_TOKEN belum di-set — keluar.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const appHeaders = { "content-type": "application/json", "x-wa-gateway-token": cfg.TOKEN };
const wahaHeaders = { "content-type": "application/json", ...(cfg.WAHA_API_KEY ? { "X-Api-Key": cfg.WAHA_API_KEY } : {}) };

// "628123" → "628123@c.us"; pass-through if it already has a JID suffix.
const toChatId = (to) => (String(to).includes("@") ? String(to) : `${String(to).replace(/\D/g, "")}@c.us`);

async function wahaPost(path, body) {
  const r = await fetch(`${cfg.WAHA_URL}${path}`, { method: "POST", headers: wahaHeaders, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`WAHA ${path} → ${r.status} ${await r.text().catch(() => "")}`);
  return r.json().catch(() => ({}));
}

async function ack(ids) {
  if (!ids.length) return;
  await fetch(`${cfg.APP_URL}/api/wa/gateway/outbox`, {
    method: "POST",
    headers: appHeaders,
    body: JSON.stringify({ ackIds: ids }),
  }).catch((e) => console.error("[waha-bridge] ack gagal:", e.message));
}

async function handleSend(job) {
  const p = job.payload || {};
  const chatId = toChatId(p.to);
  const delay = Math.min(Math.max(0, Number(p.delayMs) || 0), cfg.MAX_DELAY_MS);
  if (p.typing) await wahaPost("/api/startTyping", { session: cfg.WAHA_SESSION, chatId }).catch(() => {});
  await sleep(delay); // human pacing — type for a beat before the bubble lands
  await wahaPost("/api/sendText", { session: cfg.WAHA_SESSION, chatId, text: p.body ?? "" });
  if (p.typing) await wahaPost("/api/stopTyping", { session: cfg.WAHA_SESSION, chatId }).catch(() => {});
  console.log(`[waha-bridge] sent seq=${p.seq ?? "?"} → ${chatId} (+${delay}ms)`);
}

async function tick() {
  const r = await fetch(`${cfg.APP_URL}/api/wa/gateway/outbox?sessionId=${encodeURIComponent(cfg.SESSION_ID)}`, {
    headers: appHeaders,
  });
  if (!r.ok) throw new Error(`outbox poll → ${r.status}`);
  const { data = [] } = await r.json();
  // FIFO already (seq 0,1,2…). Ack each job right after it's handled so a crash
  // mid-batch never re-sends an already-delivered bubble.
  for (const job of data) {
    try {
      if (job.action === "send") await handleSend(job);
      else console.log(`[waha-bridge] skip action=${job.action} (WAHA session dikelola dashboard-nya)`);
      await ack([job.id]);
    } catch (e) {
      console.error(`[waha-bridge] job ${job.id} gagal:`, e.message); // leave un-acked → retried next tick
    }
  }
}

console.log(`[waha-bridge] up · app=${cfg.APP_URL} · session=${cfg.SESSION_ID} · waha=${cfg.WAHA_URL}/${cfg.WAHA_SESSION} · poll=${cfg.POLL_MS}ms`);
async function loop() {
  for (;;) {
    try {
      await tick();
    } catch (e) {
      console.error("[waha-bridge] tick error:", e.message);
    }
    await sleep(cfg.POLL_MS);
  }
}
loop();
