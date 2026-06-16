# Maira WA Gateway

A small, **standalone** Node service that bridges WhatsApp ⇄ the Maira Sales app
using [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web
multi-device). It runs on **your VPS**, not on Vercel, and it is **outbound-only**:
it polls the app for work and pushes results back — so the VPS needs **no domain,
no inbound port, no reverse proxy**.

It implements the contract in `docs/42-wa-gateway-contract.md` of the main repo.

> This is a separate mini project. It has its own `package.json` and does **not**
> import from or depend on the Next.js app in any way.

## How it works

Every request to the app carries the header `x-wa-gateway-token: <WA_GATEWAY_TOKEN>`
(must match the value set in the Vercel project). The base URL is `VERCEL_BASE_URL`.

Every `POLL_MS` (default 4s) the gateway:

1. `GET {BASE}/api/wa/gateway/outbox` → `{ data: [{ id, sessionId, action, payload }] }`,
   then for each job:
   - **`start_session`** — start/ensure a Baileys socket for `sessionId`.
   - **`send`** — `payload = { to, body }` → send a WA text from that session
     (`to` is a phone like `628123…`, mapped to JID `628123…@s.whatsapp.net`).
   - **`logout`** — log out, drop the socket, and wipe that session's creds.
   - After the batch: `POST {BASE}/api/wa/gateway/outbox { ackIds: [...] }` to
     mark the jobs done.

Event-driven pushes (per session):

- New/refreshed **QR** → `POST {BASE}/api/wa/gateway/qr { sessionId, qr }`
  (the raw Baileys QR string — the app renders it).
- Lifecycle → `POST {BASE}/api/wa/gateway/status { sessionId, status, waNumber }`
  with `status` = `qr | connected | disconnected`.
- **Inbound** message (Baileys `messages.upsert`, type `notify`, not from me,
  DMs only) → `POST {BASE}/api/wa/gateway/inbound { sessionId, from, body, name }`.

On connection close the gateway reports `disconnected` and **reconnects
automatically** unless it was an explicit logout.

### Sessions & QR linking

- Auth state is persisted per session under `sessions/<sessionId>/` via Baileys'
  `useMultiFileAuthState`, so a restart **reconnects without re-scanning the QR**.
- The gateway holds a `Map` of sockets keyed by `sessionId`, supporting **multiple
  concurrent sessions** — e.g. one per sales rep (`rep:<userId>`) in per-sales
  mode, or a single `platform:<tenantId>` session in per-platform mode.
- **Linking flow:** in the app go to *Pengaturan → Extension → WhatsApp* and
  click connect. That enqueues a `start_session` job; the gateway picks it up,
  Baileys emits a QR, the gateway pushes it to the app, and the app renders it.
  Scan it once with the target WhatsApp account (Linked Devices). On link, the
  app flips to `connected` and creds are saved — no QR needed next time.

## Run it on a VPS

Requires **Node 18+** (uses built-in `fetch`); Node 20/22 LTS recommended.

```bash
# 1. Copy this gateway/ folder to the VPS, then:
cd gateway
npm install

# 2. Configure env (copy the example and fill it in)
cp .env.example .env
#   VERCEL_BASE_URL = https://your-app.vercel.app   (no trailing slash)
#   WA_GATEWAY_TOKEN = <same value as in the Vercel project>
#   POLL_MS = 4000   (optional)

# 3. Start it
npm start
```

`npm start` runs `node index.js`. You'll see logs like
`Maira WA Gateway starting`, `[outbox] N job(s)`, `[rep:abc] QR refreshed`,
`[rep:abc] connected as 628…`.

### Keep it running

Use a process manager so it survives reboots and crashes, e.g. **pm2**:

```bash
npm i -g pm2
pm2 start index.js --name maira-wa-gateway
pm2 save && pm2 startup
```

or a **systemd** unit that sets the env vars and runs `node index.js` with
`Restart=always`. Either way, point the working directory at this folder so the
persisted `sessions/` and `.env` are found.

> `.env` is loaded automatically only if you have a loader. The simplest path is
> to `export` the vars (systemd `Environment=`, pm2 ecosystem file, or
> `set -a && . ./.env && set +a` before `npm start`). The code reads them from
> `process.env`; it does **not** require `dotenv`.

## Config (env)

| Var                | Required | Default | Notes |
| ------------------ | -------- | ------- | ----- |
| `VERCEL_BASE_URL`  | yes      | —       | App base URL, no trailing slash. |
| `WA_GATEWAY_TOKEN` | yes      | —       | Shared secret; must match Vercel. |
| `POLL_MS`          | no       | `4000`  | Outbox poll interval (ms). |
| `PINO_LEVEL`       | no       | `warn`  | Baileys' internal log level. |

## Anti-ban caveats

WhatsApp Web automation always carries some ban risk. This gateway tries to be
gentle, but **use it responsibly**:

- Sends are **rate-limited with a jittered delay** (~0.7–1.5s each) to avoid
  burst patterns.
- It does **not** message groups and ignores status broadcasts.
- Only message **opt-in contacts** — people who expect to hear from you. Cold
  blasting from a WA-Web number is the fastest way to get banned.
- Prefer an established number with normal usage history; warm up volume slowly.
- The official linked **session is the source of truth** — the gateway is just
  transport. If WhatsApp logs the device out, creds are wiped and the app will
  ask to re-link via QR.

## Files

- `index.js` — the gateway (multi-session poll/push loop).
- `package.json` — deps (`@whiskeysockets/baileys`, `pino`) + `start` script.
- `.env.example` — config template.
- `sessions/` — persisted per-session Baileys creds (gitignored; created at runtime).
