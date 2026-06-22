# WAHA gateway (outbound bridge)

Self-hosted [WAHA](https://waha.devlike.pro) (free + open-source) as the WhatsApp
gateway for Maira. Full explainer: [`docs/wa-gateway-waha.md`](../../docs/wa-gateway-waha.md).

```
cp .env.example .env       # set WA_GATEWAY_TOKEN + SESSION_ID + APP_URL
docker compose up -d        # starts WAHA (:3000) + the outbound bridge
```

Then: scan the QR at `http://localhost:3000`, and point WAHA's `message` webhook at
`{APP_URL}/api/wa/waha/inbound?token=<WA_GATEWAY_TOKEN>&sessionId=rep:u_rep`.

- `bridge.mjs` — dependency-free Node poller: outbox → `startTyping` → `delayMs` →
  `sendText` → `stopTyping` → ack. Honors humanized pacing.
- `docker-compose.yml` — WAHA (NOWEB engine) + the bridge.
- Inbound is handled by the app route `app/api/wa/waha/inbound/route.ts`.

⚠️ Still WA Web automation → WhatsApp ToS / ban risk (esp. the Jan 2026 AI-bot
ban). Reply-only + low volume + warm number. Cloud API for scale.
