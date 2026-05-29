# 17 — Prospecting / Lead intelligence (Apollo-like)

`/prospecting` ("Prospek") is the **find-new-leads** engine — the "Apollo's
prospecting power" half of the product positioning. Crawl → AI-score → enrich →
push to outbound, with an Inbound lane for lead capture. AI is woven through.

## `/prospecting`

PageHeader + **"Crawl prospek baru"** (simulated discovery) + a 5-card KPI strip
(total · lead panas · belum diperkaya · masuk CRM · inbound baru) + two tabs.

### Temukan (Discover)
- Search + **temperature filter chips** (Semua / Panas / Hangat / Dingin).
- Table sorted by **AI fit score** (highest first). Columns: prospect (avatar +
  title), company (+ industry/city), **`TempBadge`** (numeric AI score +
  panas/hangat/dingin), **enrichment status** (verified / **Perkaya** button),
  source, action.
- **Per-row actions:** *Perkaya* (fills verified email/phone/tech), *Lihat*
  (opens the AI research sheet).
- **Bulk bar** (on selection): *Perkaya*, *Ke CRM*, *Ke cadence* (outbound).

### Inbound
Captured leads from website / form / WhatsApp / Instagram / marketplace, each
**AI-scored and given a suggested next action**. Per lead: *Balas dengan AI*
(auto-reply → marks "Dibalas AI") or *Alihkan* (route → "Dialihkan").

## AI research sheet (`ProspectSheet`)
Opens on row/Lihat click:
- **Riset AI** — a generated company summary from the lead's fields.
- **Sinyal niat beli** — intent signals (pricing visits, downloads, hiring…).
- Firmographics + contact info (masked until enriched) + tech stack.
- **Pesan pembuka rekomendasi AI** — a personalized WhatsApp opener.
- Actions: **Perkaya data**, **Tambah ke CRM**, **Tambah ke cadence outbound**.

## Data & state
- `prospects.json` (60) + `inbound.json` (12), generated deterministically at
  the end of the seed (no RNG drift to other files).
- `lib/stores/prospecting-store.ts` (Zustand, in-memory): `enrich` / `enrichMany`
  / `addToCrm` / `addManyToCrm` / `replyInbound` / `routeInbound`. Enrichment
  synthesizes verified email/phone/tech client-side.
- Types: `ProspectLead`, `InboundLead`, `AiTemp`.

## AI woven across the app (this change)
- **Prospecting:** AI fit/temperature scoring, AI research summaries, AI opener,
  AI inbound auto-reply + routing.
- **Inbox:** "Saran AI" suggested-reply chips above the composer.
- **Pipeline:** deal sheet shows an **"Aksi terbaik (AI)"** next-best-action by
  stage.
- Plus the existing assistant (slide-over + `/ai-assistant`), cadence **Bantuan
  AI**, and content **Bantuan AI**.

## Files
```
app/(app)/prospecting/page.tsx              Discover + Inbound tabs
components/prospecting/prospect-sheet.tsx   AI research + actions
components/prospecting/temp-badge.tsx       AI score chip
lib/stores/prospecting-store.ts
lib/mock-data/{prospects,inbound}.json
scripts/generate-mock-data.ts               +prospect/inbound generators
lib/api-mock/data.ts                        +accessors
components/layout/top-nav.tsx               +Prospek pill
components/inbox/message-thread.tsx         +AI suggested replies
components/pipeline/deal-detail-sheet.tsx   +AI next-best-action
messages/{id,en}.json                       +nav.prospecting
```
