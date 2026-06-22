# Maira WA + Discovery Bridge (Chrome extension, MV3)

One modular bridge for Maira:
1. **WhatsApp** — reply-only gateway, same contract as the WAHA/VPS path; lowest-
   detection of the unofficial options (real browser + IP), but only runs while the
   tab is open. Explainer: [`docs/wa-extension.md`](../../docs/wa-extension.md).
2. **Discovery** — extract LinkedIn/Instagram profiles behind login → `/api/ingest`.
   Explainer: [`docs/extension-discovery.md`](../../docs/extension-discovery.md).

## Load it
1. `chrome://extensions` → **Developer mode** → **Load unpacked** → pick this folder.
2. Extension → **Pengaturan**: Backend URL, gateway token (= `WA_GATEWAY_TOKEN`),
   Session ID (`rep:u_rep`); and for discovery: **Ingest token** (per-rep) + optional
   **Workspace tujuan**.
3. WhatsApp: open `web.whatsapp.com`, log in → extension → **Aktifkan** → **Tes koneksi**.
4. Discovery: open a `linkedin.com/in/…` or `instagram.com/<user>` profile → click
   **➕ Simpan ke Maira**.

## Files
- `manifest.json` — MV3 (storage + host_permissions; content scripts on WhatsApp +
  LinkedIn/IG).
- `background.js` — service worker = network side (poll / ack / inbound / ingest), CSP-safe.
- `content.js` — WhatsApp loop + DOM (inbound observe, outbound type/send, pacing). Selectors in `SEL`.
- `discovery.js` — LinkedIn/IG profile extraction + floating "Simpan ke Maira". Selectors in `EXTRACTORS`.
- `popup.html`/`popup.js` — WA on/off + connectivity test.
- `options.html`/`options.js` — backend URL · token · sessionId · pollMs · ingest token · workspace.

⚠️ WA Web automation → violates WhatsApp ToS (Jan 2026 AI-bot ban); risk lands on
the rep's personal number. Reply-only + low volume + warm number. LinkedIn/IG
scraping violates their ToS too — manual click, low volume. Fix `SEL` / `EXTRACTORS`
selectors if a platform's DOM changes.
