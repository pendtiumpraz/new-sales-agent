# Extension discovery (LinkedIn / Instagram)

The same Chrome extension that bridges WhatsApp ([`wa-extension.md`](./wa-extension.md))
also does **lead discovery** — the "extract/profile" half of the architecture
(RPA extracts behind login; AI only recommends/filters). One modular extension,
one install, content-scripts per host.

**Why the extension (not server-side) for LinkedIn/IG:** these profiles live
behind a login the server can't hold. The extension reads them in the rep's own
browser/session, so it sees what the server never can. (Public, high-volume SERP
discovery stays server-side via a SERP API — the extension is for *enrichment
behind login*, per `progress.md` §2C.)

## Flow

```
rep opens a profile (linkedin.com/in/… or instagram.com/<user>)
   → discovery.js shows a floating "➕ Simpan ke Maira" button
   → click → extract DOM → background → POST /api/ingest
        headers: x-ingest-token (per-rep → auto-assign to that rep)
        body: { origin:"extension", workspaceId?, people:[{…}] }
   → lead upserted (idempotent dedup), tagged to the workspace, owned by the rep
```

`/api/ingest` is idempotent (per-tenant dedup keys), tags the whole batch to the
configured `workspaceId` (1 ws = 1 produk), and — when the **per-rep** ingest token
is used — auto-assigns each lead to that rep. If the extension doesn't classify
(`leadType`), the server fills the gap with its fallback classifier + salutation.

## What it extracts (best-effort)

- **LinkedIn** (`/in/*`): full name, headline → `title`, location, About, company
  parsed from the headline, canonical profile URL → `linkedinUrl`. Defaults
  `leadType: b2b_partner`.
- **Instagram** (`/<username>`): display name, bio → `about`, website + profile
  link → `socials`, profile URL → `sourceUrl`. Defaults `leadType: b2c_customer`.

Selectors are centralized in `EXTRACTORS` in `discovery.js` — the one place to fix
when a platform changes its DOM. Extraction is best-effort with URL fallbacks, so a
missing node never throws (worst case: name + profile URL).

## Setup

In the extension **Options**, set:
- **Ingest token** — the rep's per-rep token (`resolveRepByToken`, so leads
  auto-assign) or `LINKEDIN_INGEST_TOKEN` (tenant pool, unassigned).
- **Workspace tujuan** — `ws_…` to tag captured leads to that workspace (blank =
  tenant pool).

Then browse a LinkedIn/IG profile and click **Simpan ke Maira**. The lead shows up
in that workspace's Discovery list (and the `/contacts` → workspace flow).

## Caveats

- **ToS**: scraping LinkedIn/IG violates their terms; keep it to profiles the rep
  is genuinely working, low volume, manual click (no bulk auto-crawl here).
- **Fragile DOM**: LinkedIn/IG ship obfuscated, frequently-changing markup. When
  extraction returns just the name, the `EXTRACTORS` selectors need updating.
- **Manual, not auto**: discovery is rep-initiated (button click) by design — it
  doesn't background-crawl. Bulk/automated sourcing belongs to the server SERP path.
