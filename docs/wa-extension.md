# Chrome extension (WA Web bridge)

A Manifest V3 extension that turns the rep's own WhatsApp Web tab into a gateway.
It implements the **same contract** as the WAHA/VPS path (`wa-gateway-contract.md`)
— the brain stays on the server; the extension is just transport. Of the two
unofficial paths it has the **most human fingerprint** (the rep's real Chrome +
session + residential IP), so it's the lowest-detection option — at the cost of
not being 24/7 (only runs while the tab is open).

Lives in `gateway/extension/`.

## How it's wired

```
content.js (web.whatsapp.com, persistent loop + DOM)
   ├─ MutationObserver on incoming bubbles → background → POST /api/wa/gateway/inbound
   └─ every pollMs → background → GET /api/wa/gateway/outbox?sessionId=…
                                   └─ for each send job: openChat → wait(delayMs) → type → Enter
                                   └─ ack → POST /api/wa/gateway/outbox { ackIds }
background.js (service worker) = the network side (host_permissions → bypasses WA Web CSP)
popup.html  = on/off toggle + connectivity test
options.html = backend URL · token · sessionId · pollMs
```

**Why split content/background?** A content-script `fetch` to our app would hit
WA Web's strict CSP. Network in the service worker is governed by the extension's
`host_permissions` instead, so it's allowed. The content script owns the loop
(it lives as long as the tab is open; the SW is ephemeral) and all DOM work.

## Install (dev)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select `gateway/extension/`.
2. Click the extension → **Pengaturan**: set Backend URL (`http://localhost:3100`),
   the gateway token (= `WA_GATEWAY_TOKEN`), and the Session ID (`rep:u_rep`, must
   match a `wa_session` row — `npm run db:seed-wa`).
3. Open `https://web.whatsapp.com`, log in (scan QR).
4. Click the extension → **Aktifkan auto-reply**. Use **Tes koneksi** to confirm
   the backend + token are reachable.
5. Backend: `WA_AUTO_REPLY=1` (+ optional `wa_reply_allowlist:<tenantId>`).

Now an inbound WA message → the app's orchestrator drafts paced bubbles → the
extension types + sends them like a person.

## The fragile part (be honest)

WA Web ships obfuscated, frequently-changing DOM. **All selectors are centralized
in `SEL` at the top of `content.js`** — when WA breaks the bridge, that's the one
place to fix. Specifically brittle:

- **Inbound parsing** reads `data-id="false_<chatId>_<msgId>"` off message rows and
  the text from `span.selectable-text`. Robust-ish (data-id is stable-ish), but
  class names like `message-in` can change.
- **Sending** uses `document.execCommand("insertText")` into WA's Lexical compose
  box + a synthetic Enter. This is the classic approach and the first thing to
  break on a WA update. If it stops typing, that's the selector/`execCommand` path.
- **openChat** drives the left-pane search to open a chat by number. Reply-only,
  so the contact is already in the list. Fragile selector.

For a hardened version, swap the DOM layer for an injected [`@wppconnect/wa-js`](https://github.com/wppconnect-team/wa-js)
store hook (keeps the same background/contract). Left as a follow-up — the DOM
path is enough to demo the full loop.

## Caveats

- **Not 24/7** — only runs while Chrome + the WA tab are open. For always-on, use
  the WAHA/VPS gateway (`wa-gateway-waha.md`) or the official Cloud API.
- **ToS / ban** — still WA Web automation; the Jan 2026 WA update bars third-party
  AI chatbots, and a ban hits the rep's personal number. Mitigation (enforced
  server-side): reply-only allowlist, humanized pacing (`delayMs`+typing), low
  volume, semi-auto draft→approve. Keep the number warm.
- **One modular extension** beats multiple installs — the LinkedIn/IG discovery
  content-script ships in the same extension; see [`extension-discovery.md`](./extension-discovery.md).
  This file covers the WA-send/read piece.
