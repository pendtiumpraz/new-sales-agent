# 16 — Content creation & planning (Konten)

A top-level surface for marketing content production: WhatsApp broadcasts,
email campaigns, Instagram + Tokopedia posts, and blog articles — drafted,
reviewed, scheduled, and tracked through a single workspace.

## `/content`

PageHeader · 5-card KPI strip · two tabs (**Pustaka** | **Kalender**) · global
**Buat konten** CTA.

### KPI strip

Computed from the content store:

| | |
|---|---|
| Draf | items with status `draft` |
| Menunggu review | items with status `review` |
| Terjadwal 7 hari | scheduled items with `scheduledFor` in the next 7 days |
| Diterbitkan bulan ini | published items dated within the current month |
| Total reach | sum of `reach` across published items |

### Pustaka (Library)

Filterable card grid — search across title / body / tags, plus chip filters
for **content type** (with their channel-color dot) and **status**.

Each card shows: type icon square + label, status badge, title, subject
(emails), body preview (line-clamp-3), tag chips, scheduled/published date,
audience + reach (when published), and a status `DropdownMenu` that lets you
move the item through the workflow or delete it.

### Kalender (Calendar)

Month-view grid (Mon–Sun) built with `date-fns`. Defaults to **May 2026** to
align with the rest of the mock dataset, with prev/next/`Hari ini` controls.

Each day cell:

- Date number (today gets a teal pill).
- Up to 3 scheduled-item chips, colored by content type; overflow shows
  "+ N lainnya".
- A subtle `+` button (visible on hover) that opens the create dialog
  with the day pre-selected.

Clicking a chip opens a `<Popover>` with the full body preview, audience,
scheduled time, status badge, and a **Tandai diterbitkan** quick action
(for scheduled items).

## Create dialog

`ContentCreateDialog` — a `<Dialog>` with: title · type select (with the
channel-color dot) · audience · email subject (conditional) · body textarea
with a **Bantuan AI** button · CTA · schedule date · tag chips. Two save
actions:

- **Simpan sebagai draf** — status `draft`, no schedule required.
- **Simpan & jadwalkan** — status `scheduled`, requires a date; toast confirms.

The Bantuan AI button rotates through `CONTENT_AI_DRAFTS[type]` (inline
templates per channel — WA short + emoji, email subject + body, Instagram
caption + hashtags-friendly, Tokopedia promo-style, blog markdown intro).
For email drafts it auto-splits the `Subjek:` line into the subject field.

## State

`lib/stores/content-store.ts` is a Zustand store seeded from
`content.json`. Operations:

```ts
add(item) · update(id, patch) · remove(id) · setStatus(id, status) ·
schedule(id, scheduledFor)
```

In-memory only (build.md hard rule §2 forbids localStorage). The session
remembers your drafts, status moves, and reschedules — refresh resets.

## Content types & status flow

```
ContentType  =  wa-broadcast | email-campaign | instagram-post |
                tokopedia-post | blog
ContentStatus = draft → review → approved → scheduled → published
```

`lib/utils/content-config.ts` is the single source of truth for each type's
label, icon, and color (channel colors when applicable — WA `#25D366`,
Tokopedia `#03AC0E`, IG `#E1306C`, Email `#6366F1`, Blog `#8B5CF6`), plus
the status → badge-variant map (`Draf` muted · `Review` warning · `Disetujui`
secondary · `Terjadwal` primary · `Diterbitkan` success).

## Mock data

`scripts/generate-mock-data.ts` writes **32 items** (8 WA broadcasts, 7 email
campaigns, 8 IG posts, 5 Tokopedia posts, 4 blog articles), with statuses
weighted 25/12/12/30/21 % across draft/review/approved/scheduled/published.
Scheduled items get `scheduledFor` in the next 21 days; published items get
dates from the previous 21 days plus a `reach` count between 120 and 18.5 k.

## Files

```
lib/types.ts                                    +ContentItem / ContentType / ContentStatus
lib/utils/content-config.ts                     type meta + status meta + AI drafts
lib/stores/content-store.ts                     Zustand store
lib/mock-data/content.json                      32 deterministic items
scripts/generate-mock-data.ts                   +content generation block
lib/api-mock/data.ts                            +content accessor
components/content/content-library.tsx          filterable card grid + status menu
components/content/content-calendar.tsx         month grid + chip popovers
components/content/content-create-dialog.tsx    create form + AI draft
app/(app)/content/page.tsx                      KPI strip + tabs
components/layout/sidebar.tsx                   +Konten nav item
messages/{id,en}.json                           +nav.content label
```
