// =============================================================================
// Maira WA Gateway — outbound-only WhatsApp bridge (Baileys) for a VPS.
//
// Implements docs/42-wa-gateway-contract.md. The gateway NEVER accepts inbound
// HTTP: it only POLLs the Vercel app for work and PUSHes results back. That's
// why the VPS needs no domain and no open port.
//
//   Loop (every POLL_MS):
//     GET  {BASE}/api/wa/gateway/outbox  -> {data:[{id,sessionId,action,payload}]}
//       action "start_session" -> ensure a Baileys socket for sessionId
//       action "send"          -> payload {to, body} -> send WA text
//       action "logout"        -> logout + drop socket + wipe creds
//     POST {BASE}/api/wa/gateway/outbox  {ackIds:[...]}   (mark batch done)
//
//   Event-driven pushes (per session):
//     QR refresh   -> POST {BASE}/api/wa/gateway/qr      {sessionId, qr}
//     connected    -> POST {BASE}/api/wa/gateway/status  {sessionId, status, waNumber}
//     disconnected -> POST {BASE}/api/wa/gateway/status  {sessionId, status}
//     inbound msg  -> POST {BASE}/api/wa/gateway/inbound  {sessionId, from, body, name}
//
// Every request carries header `x-wa-gateway-token: WA_GATEWAY_TOKEN`.
//
// Auth state is persisted per session under ./sessions/<sessionId>/ via
// useMultiFileAuthState, so a restart reconnects WITHOUT re-scanning the QR.
// =============================================================================

import { mkdir } from "node:fs/promises";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pino from "pino";
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";

// --- Config -----------------------------------------------------------------

const BASE = (process.env.VERCEL_BASE_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.WA_GATEWAY_TOKEN || "";
const POLL_MS = Number(process.env.POLL_MS || 4000);

if (!BASE || !TOKEN) {
  console.error(
    "[fatal] VERCEL_BASE_URL and WA_GATEWAY_TOKEN are required. " +
      "Copy .env.example to .env (or export them) and try again.",
  );
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = path.join(__dirname, "sessions");

// Quiet Baileys' own (very chatty) logger; we do our own clear logging.
const logger = pino({ level: process.env.PINO_LEVEL || "warn" });

// --- HTTP helpers (built-in fetch; no axios) --------------------------------

// All calls to the app go through here so the auth header is never forgotten.
// Returns parsed JSON, or null on any network/parse failure (caller decides).
async function api(method, pathname, body) {
  const url = `${BASE}${pathname}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "x-wa-gateway-token": TOKEN,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      console.warn(`[api] ${method} ${pathname} -> HTTP ${res.status}`);
      return null;
    }
    // Some endpoints return {ok:true} with no useful body; tolerate empty.
    return await res.json().catch(() => ({}));
  } catch (err) {
    console.warn(`[api] ${method} ${pathname} failed:`, err?.message || err);
    return null;
  }
}

const pushQr = (sessionId, qr) => api("POST", "/api/wa/gateway/qr", { sessionId, qr });
const pushStatus = (sessionId, status, waNumber) =>
  api("POST", "/api/wa/gateway/status", { sessionId, status, ...(waNumber ? { waNumber } : {}) });
const pushInbound = (sessionId, from, body, name) =>
  api("POST", "/api/wa/gateway/inbound", { sessionId, from, body, ...(name ? { name } : {}) });

// --- Utilities ---------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "628123..." (or a full JID) -> "628123...@s.whatsapp.net".
function toJid(to) {
  if (!to) return null;
  if (to.includes("@")) return to; // already a JID
  const digits = String(to).replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : null;
}

// Strip a JID back down to the sender's phone digits for inbound attribution.
function jidToDigits(jid) {
  if (!jid) return "";
  return String(jid).split("@")[0].split(":")[0].replace(/\D/g, "");
}

// Pull the plain text out of the many shapes a Baileys message can take.
function extractText(msg) {
  const m = msg?.message;
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  );
}

// =============================================================================
// Session manager — a Map<sessionId, sessionState> so multiple reps each get
// their own socket. Per session we hold the live socket, a "started" guard so
// repeated start_session jobs are idempotent, and a logout flag so the close
// handler knows not to auto-reconnect after an explicit logout.
// =============================================================================

const sessions = new Map();

function getState(sessionId) {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { sock: null, starting: false, loggingOut: false, waNumber: null };
    sessions.set(sessionId, s);
  }
  return s;
}

// Start (or restart) a Baileys socket for a session and wire up its events.
async function startSession(sessionId) {
  const state = getState(sessionId);

  // Idempotent: a fresh start_session for an already-live or in-flight socket
  // is a no-op. (The app re-enqueues start_session whenever the user clicks
  // "connect", so this guard matters.)
  if (state.starting) return;
  if (state.sock?.user) {
    console.log(`[${sessionId}] already connected as ${state.sock.user.id}`);
    return;
  }
  state.starting = true;
  state.loggingOut = false;

  try {
    const authDir = path.join(SESSIONS_DIR, sanitizeId(sessionId));
    await mkdir(authDir, { recursive: true });

    const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);

    // Use the newest WA Web version when reachable; fall back to Baileys'
    // bundled default if the VPS can't hit GitHub (non-fatal).
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      version = undefined; // Baileys uses its built-in default
    }

    const sock = makeWASocket({
      ...(version ? { version } : {}),
      logger,
      printQRInTerminal: false, // we relay the QR string to the app instead
      auth: {
        creds: authState.creds,
        // Cache signal keys so re-sends/decryption stay fast across reconnects.
        keys: makeCacheableSignalKeyStore(authState.keys, logger),
      },
      markOnlineOnConnect: false, // less "presence" noise -> a bit safer
      syncFullHistory: false,
    });
    state.sock = sock;

    // Persist creds whenever they change (this is what enables QR-less reconnect).
    sock.ev.on("creds.update", saveCreds);

    // ----- connection lifecycle -----
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // New / refreshed QR -> relay the RAW string; the app renders it.
      if (qr) {
        console.log(`[${sessionId}] QR refreshed -> pushing to app`);
        await pushStatus(sessionId, "qr");
        await pushQr(sessionId, qr);
      }

      if (connection === "open") {
        state.starting = false;
        state.waNumber = jidToDigits(sock.user?.id);
        console.log(`[${sessionId}] connected as ${state.waNumber}`);
        await pushStatus(sessionId, "connected", state.waNumber);
      }

      if (connection === "close") {
        state.sock = null;
        state.starting = false;

        const statusCode =
          lastDisconnect?.error?.output?.statusCode ??
          lastDisconnect?.error?.output?.payload?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut || state.loggingOut;

        console.log(
          `[${sessionId}] connection closed (code=${statusCode ?? "?"}) ` +
            `${loggedOut ? "-> logged out, not reconnecting" : "-> reconnecting"}`,
        );

        await pushStatus(sessionId, "disconnected", state.waNumber || undefined);

        if (loggedOut) {
          // WhatsApp invalidated the session — creds are dead. Wipe them so a
          // future start_session begins a clean QR pairing.
          await wipeCreds(sessionId).catch(() => {});
          state.waNumber = null;
          state.loggingOut = false;
        } else {
          // Transient drop (network, restart, conflict). Reconnect with a small
          // backoff; the persisted creds mean no QR re-scan.
          await sleep(2000);
          startSession(sessionId).catch((e) =>
            console.warn(`[${sessionId}] reconnect failed:`, e?.message || e),
          );
        }
      }
    });

    // ----- inbound messages -----
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return; // ignore history/append syncs
      for (const msg of messages) {
        try {
          if (!msg.message) continue;
          if (msg.key?.fromMe) continue; // don't echo our own sends
          const remoteJid = msg.key?.remoteJid || "";
          // Skip groups / status broadcasts — DMs only.
          if (remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") continue;

          const body = extractText(msg).trim();
          if (!body) continue;

          const from = jidToDigits(remoteJid);
          const name = msg.pushName || undefined;
          console.log(`[${sessionId}] inbound from ${from}: ${body.slice(0, 60)}`);
          await pushInbound(sessionId, from, body, name);
        } catch (err) {
          // One bad message must never break the listener.
          console.warn(`[${sessionId}] inbound handler error:`, err?.message || err);
        }
      }
    });
  } catch (err) {
    state.starting = false;
    console.error(`[${sessionId}] startSession failed:`, err?.message || err);
  }
}

// Explicit logout: close the socket and remove persisted creds.
async function logoutSession(sessionId) {
  const state = sessions.get(sessionId);
  if (state) state.loggingOut = true;
  try {
    if (state?.sock) {
      await state.sock.logout().catch(() => {});
      try {
        state.sock.end(undefined);
      } catch {
        /* ignore */
      }
    }
  } finally {
    await wipeCreds(sessionId).catch(() => {});
    sessions.delete(sessionId);
    await pushStatus(sessionId, "disconnected");
    console.log(`[${sessionId}] logged out + creds wiped`);
  }
}

// Send a WA text from a session's socket. Returns true on success.
async function sendText(sessionId, to, body) {
  const state = sessions.get(sessionId);
  if (!state?.sock?.user) {
    console.warn(`[${sessionId}] send skipped: session not connected`);
    return false;
  }
  const jid = toJid(to);
  if (!jid) {
    console.warn(`[${sessionId}] send skipped: bad recipient "${to}"`);
    return false;
  }
  await state.sock.sendMessage(jid, { text: String(body ?? "") });
  console.log(`[${sessionId}] sent to ${jidToDigits(jid)}`);
  return true;
}

// --- creds-dir helpers -------------------------------------------------------

// sessionId can be "rep:<userId>" / "platform:<tenantId>" — ":" is illegal in
// some FS contexts, so map it to a safe folder name.
function sanitizeId(sessionId) {
  return String(sessionId).replace(/[^a-zA-Z0-9_.-]/g, "_");
}

async function wipeCreds(sessionId) {
  const authDir = path.join(SESSIONS_DIR, sanitizeId(sessionId));
  await rm(authDir, { recursive: true, force: true });
}

// =============================================================================
// Outbox processing
// =============================================================================

// Handle one job. Returns true if it should be ACKed (i.e. we accepted/processed
// it — including known-but-failed sends, which we ack so they don't loop forever).
async function handleJob(job) {
  const { sessionId, action, payload } = job;
  switch (action) {
    case "start_session":
      await startSession(sessionId);
      return true;

    case "send": {
      // Humanize a touch: jittered delay before each send to dampen burst
      // patterns that get WA-Web numbers flagged.
      await sleep(700 + Math.floor(Math.random() * 800));
      await sendText(sessionId, payload?.to, payload?.body);
      return true;
    }

    case "logout":
      await logoutSession(sessionId);
      return true;

    default:
      console.warn(`[outbox] unknown action "${action}" (job ${job.id}) — acking to clear`);
      return true; // ack unknown actions so a bad row can't wedge the queue
  }
}

// One poll cycle: pull pending work, process each job (isolated), ack the batch.
async function pollOnce() {
  const res = await api("GET", "/api/wa/gateway/outbox");
  const jobs = Array.isArray(res?.data) ? res.data : [];
  if (!jobs.length) return;

  console.log(`[outbox] ${jobs.length} job(s)`);
  const ackIds = [];
  for (const job of jobs) {
    try {
      const ok = await handleJob(job);
      if (ok) ackIds.push(job.id);
    } catch (err) {
      // Never let one bad job kill the loop. We still ack to avoid a poison
      // job spinning forever; surface it loudly in the logs instead.
      console.error(`[outbox] job ${job?.id} (${job?.action}) failed:`, err?.message || err);
      if (job?.id) ackIds.push(job.id);
    }
  }
  if (ackIds.length) await api("POST", "/api/wa/gateway/outbox", { ackIds });
}

// =============================================================================
// Boot
// =============================================================================

async function main() {
  await mkdir(SESSIONS_DIR, { recursive: true });
  console.log("Maira WA Gateway starting");
  console.log(`  base    : ${BASE}`);
  console.log(`  poll    : ${POLL_MS}ms`);
  console.log(`  sessions: ${SESSIONS_DIR}`);

  // Reconnect any sessions we already have persisted creds for, so a gateway
  // restart resumes every linked rep WITHOUT waiting for a start_session job.
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(SESSIONS_DIR, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.isDirectory()) {
        console.log(`[boot] resuming persisted session "${e.name}"`);
        startSession(e.name).catch(() => {});
      }
    }
  } catch {
    /* no persisted sessions yet */
  }

  // The poll loop. Self-scheduling (not setInterval) so a slow cycle can't
  // overlap with the next one. The whole body is wrapped so a poll failure
  // just logs and retries next tick.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await pollOnce();
    } catch (err) {
      console.error("[loop] poll cycle error:", err?.message || err);
    }
    await sleep(POLL_MS);
  }
}

// Graceful shutdown so creds get flushed and sockets close cleanly.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`\n[${sig}] shutting down…`);
    for (const [, s] of sessions) {
      try {
        s.sock?.end(undefined);
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
