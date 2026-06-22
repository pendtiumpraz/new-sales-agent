# WAHA as the WhatsApp gateway

[WAHA](https://waha.devlike.pro) (WhatsApp HTTP API) is a self-hosted server that
talks to WhatsApp Web and exposes a REST API + webhooks. As of 2026 it's **100%
free + open-source** — no more separate "Plus" image, all features (unlimited
sessions, media, storages, security) are free; support is optional (Boosty /
Patreon / Crypto). That makes it the cheapest **server-gateway** option for the
unofficial-WA path.

Our backend is **gateway-agnostic** (see `wa-gateway-contract.md`): the brain
(orchestrator, humanizer, stage-machine, guardrails) stays on the app. WAHA only
needs to (a) push inbound messages in and (b) send our paced outbound bubbles.

## Shape

```
                 webhook (message)
  WhatsApp ──► WAHA ───────────────► POST /api/wa/waha/inbound   (normalize → brain)
       ▲                                      │
       │                                      ▼  enqueues paced bubbles
       │   POST /api/sendText          GET /api/wa/gateway/outbox?sessionId=…
       └──────────── bridge.mjs ◄─────────────┘   (poll → typing+delay → send → ack)
```

- **Inbound** is a dedicated Next route, `/api/wa/waha/inbound`, that converts
  WAHA's webhook payload (`{event, payload:{from, body, fromMe, _data.notifyName}}`)
  into our generic `{sessionId, from, body, name}` and forwards to
  `/api/wa/gateway/inbound`. **No orchestrator logic is duplicated** — one brain.
  It drops `fromMe`, groups (`@g.us`), and broadcast/status.
- **Outbound** is `gateway/waha/bridge.mjs`, a tiny dependency-free Node poller.
  It honors `delayMs` + `typing` (startTyping → sleep → sendText → stopTyping) so
  the send paces like a human — the pacing must live in the gateway because the
  app is stateless about it.

## Hosted WAHA + Vercel (per-account, recommended)

When WAHA runs on a server you own and the app sets `WAHA_URL` + `WAHA_API_KEY`,
the app drives WAHA's REST API **directly** — no bridge process, and **one WAHA
session per account (1 account = 1 WA number = 1 QR)**:

- **Connect / QR** — `lib/wa/waha-client.ts` + `/api/wa/session` create one WAHA
  session per account (`rep:<userId>` → WAHA name `rep_<userId>`), configure that
  session's webhook to `…/api/wa/waha/inbound?token=…&sessionId=rep:<userId>`, and
  fetch its QR. `WaConnectCard` renders it; each rep scans their own. Status maps
  `WORKING→connected`, `SCAN_QR_CODE→qr`.
- **Send** — `/api/wa/waha/inbound` delivers the reply bubbles **inline via WAHA**
  (typing + capped `delayMs` → `sendText`), so no VPS bridge is needed. The route
  sets `maxDuration = 30` for the pacing; on Vercel Hobby (10s cap) keep the
  humanizer delays short. With this path, **don't also run `bridge.mjs`** for the
  same sessions (it would double-send).

**Env (set in `.env.local` + Vercel — never commit the key):**
```
WAHA_URL=https://<host>/waha       # REST base, no trailing slash
WAHA_API_KEY=<the X-Api-Key WAHA was started with>
WA_GATEWAY_TOKEN=<shared secret>   # authenticates the WAHA→app webhook
APP_URL=https://<your-app>         # public base WAHA calls back (Vercel deploy URL)
WA_AUTO_REPLY=1
```
Then in the app: open WhatsApp connect → **Hubungkan WhatsApp** → scan the QR. The
session's webhook is wired automatically at connect time. That's it — no Docker,
no bridge.

## Setup (local Docker + bridge — alternative)

1. **Run WAHA + bridge** (`gateway/waha/`):
   ```
   cp .env.example .env      # set WA_GATEWAY_TOKEN, SESSION_ID, APP_URL
   docker compose up -d
   ```
2. **Scan QR**: open `http://localhost:3000`, start session `default`, scan with
   the rep's phone. (Persisted in the `waha-sessions` volume.)
3. **Seed our session row** so inbound has an owner to attribute to:
   ```
   npm run db:seed-wa          # creates rep:u_rep (connected) on t_default
   ```
   `SESSION_ID` in `.env` must match a `wa_session` row id.
4. **Point WAHA's webhook** at the adapter. In the WAHA dashboard (or env), set
   the webhook URL with the secret + the session binding as query params:
   ```
   {APP_URL}/api/wa/waha/inbound?token=<WA_GATEWAY_TOKEN>&sessionId=rep:u_rep
   ```
   Subscribe to the **`message`** event (incoming only). The `sessionId` query is
   what ties this WAHA number to a rep/platform session on our side.
5. **Enable auto-reply** on the app: `WA_AUTO_REPLY=1` (+ optional
   `wa_reply_allowlist:<tenantId>` to restrict which numbers get auto-replied).

## Quick local test (no Docker, no real WA)

You can exercise the adapter without WAHA by POSTing a WAHA-shaped webhook:
```
curl -X POST "http://localhost:3100/api/wa/waha/inbound?token=testtoken123&sessionId=rep:u_rep" \
  -H "content-type: application/json" \
  -d '{"event":"message","payload":{"from":"628123456789@c.us","body":"halo kak, ini apa ya?","_data":{"notifyName":"Budi"}}}'
```
→ logs the inbound, runs the orchestrator, and enqueues paced bubbles in the
outbox (the bridge would then deliver them via WAHA). Inspect with
`GET /api/wa/gateway/outbox?sessionId=rep:u_rep` (with the token header).

## Caveats (honest)

- **Free ≠ ban-safe.** WAHA is still WA Web automation under the hood — same ToS
  problem as Baileys/open-wa, and the **Jan 2026** WA update bars third-party AI
  chatbots. Mitigation is unchanged: **reply-only**, humanized pacing, low volume,
  warm number, semi-auto draft→approve.
- **Server-gateway = more detectable** than the Chrome extension (datacenter IP +
  headless engine vs. the rep's real browser/IP). WAHA wins on cost + dev speed
  (REST API is ready-made); the extension wins on ban-risk. Pick per use case.
- For real scale / ban-safety, the official **WA Cloud API** is the only clean
  path (verification + templates + 24h window + per-message cost).
