# Maira Sales — LinkedIn Lead Collector (Chrome MV3)

Collects leads from LinkedIn **search results you're already viewing** into your
Maira Sales workspace via `/api/ingest`. Runs in **your own logged-in session** —
no credentials are stored or transmitted. (Fase 6, doc 21/25)

## How it works

```
content.js   reads the visible search-result DOM → {people[], companies[]}
background.js buffers in chrome.storage.local → flushes a small batch every
              60–120s (jittered, anti-ban) to /api/ingest with x-ingest-token,
              respecting a daily cap; aggressive posture requires consent
popup.html    config (API base + token), posture, consent, Scan/Flush, status
```

The server side dedupes by stable id, so re-sending is idempotent.

## Install (unpacked)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this `extension/` folder.
2. Open the popup, set:
   - **API base URL** — your deployment (e.g. `https://app.mairasales.com`) or `http://localhost:3000` for dev.
   - **Ingest token** — the value of `LINKEDIN_INGEST_TOKEN` from the server's env (maps to `LINKEDIN_INGEST_TENANT`).
   - **Posture** — `compliant` (default) / `balanced` / `aggressive` (consent-gated).
3. Go to a LinkedIn **search** page (people or company), click **Scan visible results**, then **Flush** (or wait for the scheduled sync).

## Guardrails (built in)

- **Your session only** — uses the page you're viewing; never logs in, never stores LinkedIn credentials.
- **Rate-limited + jittered** flush (60–120s) and a **daily cap** — anti-ban.
- **Consent gate** for `aggressive` posture, with a ToS-risk warning.
- **Idempotent** server ingest (dedup by stable id).

## Caveats

- DOM selectors in `content.js` are best-effort — LinkedIn changes its markup
  often; tune the selectors if a scan returns 0 results.
- The ingest token currently maps to one tenant (`LINKEDIN_INGEST_TENANT`).
  Production should issue per-tenant signed tokens.
- Respect LinkedIn's Terms of Service and applicable law (UU PDP / GDPR). This is
  a user-operated tool; you are responsible for how you use it.
