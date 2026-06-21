# WA Gateway Contract (extension / VPS)

The backend is **gateway-agnostic**: it only enqueues outbound jobs and receives
inbound via webhook. Any transport — a **Chrome extension** on the rep's WA Web,
or a VPS (Baileys/open-wa) — implements this same contract. The brain
(orchestrator, humanizer, stage-machine, guardrails) stays on the server.

## Auth

Every request sends header `x-wa-gateway-token: <WA_GATEWAY_TOKEN>` (shared
secret, env). Missing/wrong → 401.

## Session id

`rep:<userId>` (per-sales mode) or `platform:<tenantId>` (per-platform mode).
A per-rep extension uses its own `rep:<userId>`.

## Endpoints

### 1. Push inbound — `POST /api/wa/gateway/inbound`
The extension observes an incoming WA Web message and forwards it.
```
Body: { sessionId, from, body, name? }
```
Backend logs it, then (if `WA_AUTO_REPLY=1` and `from` is allowlisted) runs the
stage-aware orchestrator and **enqueues paced reply bubbles** as `send` jobs.

### 2. Poll outbox — `GET /api/wa/gateway/outbox?sessionId=rep:<userId>`
Pull pending jobs (FIFO). Omit `sessionId` for a central VPS that holds every
session; a per-rep extension passes its own.
```
→ { data: [ { id, sessionId, action, payload } ] }
```
Actions: `start_session` | `send` | `logout`.

`send` payload (the humanized, paced bubble):
```
{ to, body, delayMs, typing, seq }
```
- `seq` — bubble order (0,1,2…). Send in order (poll is already FIFO).
- `typing` — show the "typing…" indicator before sending.
- `delayMs` — how long to "type" before sending this bubble (paces it like a person).

### 3. Ack — `POST /api/wa/gateway/outbox`
Mark delivered jobs done so they aren't re-sent.
```
Body: { ackIds: [ "<jobId>", … ] }
```

## The loop the extension implements

```
on inbound WA Web message:
    POST /inbound { sessionId, from, body, name }

every few seconds:
    GET /outbox?sessionId=rep:<me>
    for job in data (already FIFO by seq):
        if job.action == "send":
            if job.payload.typing: showTyping(job.payload.to)
            sleep(job.payload.delayMs)        // human pacing
            sendMessage(job.payload.to, job.payload.body)
    POST /outbox { ackIds: [job.id for each handled job] }
```

## Notes / guardrails (already enforced server-side)
- **Reply-only + allowlist**: backend only auto-replies to numbers in
  `wa_reply_allowlist:<tenantId>` (empty = all). The extension never cold-blasts.
- **Pacing = ban mitigation**: honoring `delayMs` + `typing` is what makes it look
  human. Do NOT fire bubbles instantly.
- **Not 24/7**: a Chrome extension only runs while the browser + WA Web tab are
  open. For 24/7 use a VPS gateway (more detectable) or the official Cloud API.
- **ToS**: WA Web automation violates WhatsApp ToS (and the Jan 2026 update bars
  third-party AI chatbots). Keep volume low, number warm; Cloud API for scale.
