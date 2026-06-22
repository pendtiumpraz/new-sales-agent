# Maira WA Bridge (Chrome extension, MV3)

Turns the rep's WhatsApp Web tab into a reply-only gateway for Maira. Same gateway
contract as the WAHA/VPS path; lowest-detection of the unofficial options (real
browser + IP), but only runs while the tab is open. Full explainer:
[`docs/wa-extension.md`](../../docs/wa-extension.md).

## Load it
1. `chrome://extensions` → **Developer mode** → **Load unpacked** → pick this folder.
2. Extension → **Pengaturan**: Backend URL, gateway token (= `WA_GATEWAY_TOKEN`),
   Session ID (`rep:u_rep`).
3. Open `web.whatsapp.com`, log in → extension → **Aktifkan** → **Tes koneksi**.

## Files
- `manifest.json` — MV3 (storage + host_permissions; content script on web.whatsapp.com).
- `background.js` — service worker = network side (poll / ack / inbound), CSP-safe.
- `content.js` — loop + DOM (inbound observe, outbound type/send, pacing). Selectors in `SEL`.
- `popup.html`/`popup.js` — on/off + connectivity test.
- `options.html`/`options.js` — backend URL · token · sessionId · pollMs.

⚠️ WA Web automation → violates WhatsApp ToS (Jan 2026 AI-bot ban); risk lands on
the rep's personal number. Reply-only + low volume + warm number. Cloud API for scale.
WA Web DOM changes often → if it breaks, fix the `SEL` selectors in `content.js`.
