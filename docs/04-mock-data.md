# 04 — Mock data & API layer

Why this exists: the prototype must feel real with **zero backend**. Every
list, every chart, every drag-drop reads from typed in-memory data.

## Deterministic generator

`scripts/generate-mock-data.ts` is a seeded faker script (`faker.seed(2026)`)
that writes 14 JSON files into `lib/mock-data/`:

```
companies.json      80   Indonesian PT/CV/Koperasi names
contacts.json      500   names, titles, channel preference, consent
deals.json          50   IDR values 5 jt – 2 M, 5 pipeline stages
conversations.json  30   across WA/email/IG/LinkedIn/SMS
messages.json      235   5–12 per convo, in/out, Bahasa + English mix
cadences.json       12   active / draft / paused
sequences.json      13   step definitions per cadence + default template
field-reps.json      8   5 in Jakarta + 3 in Surabaya, with lat/lng + route
visits.json         40   recent field visits
orders.json        100   Tokopedia / Shopee / TikTok orders
ai-responses.json    4   canned AI assistant replies (build.md §5.10)
consent-log.json    50   UU PDP consent entries
tasks.json           8   today's tasks (dashboard)
activity.json       10   recent team activity (dashboard)
```

Run `npm run seed` to regenerate.

## API layer (replaces MSW)

`lib/api-mock/data.ts` exports typed accessors over the JSON. `lib/api-mock/hooks.ts`
wraps them in **React Query** hooks with ~280 ms simulated latency so loading
skeletons appear during the demo:

```
useContacts() · useContact(id) · useDeals()
useConversations() · useConversation(id) · useTasks() · useActivity()
useCadences() · useSequence(id)
useFieldReps() · useVisits() · useOrders() · useConsentLog()
useDashboard()      ← derived KPIs + funnel data
matchAiResponse(prompt)   ← powers /ai-assistant + cadence "Bantuan AI"
```

## Why not MSW?

MSW's service-worker registration is the #1 source of flakiness in Next 14 App
Router (hydration timing, scope conflicts, dev/prod parity). The demo's
emotional message is *speed* (build.md §12) — service-worker bootup spinners
work against that. React Query over a typed in-memory module gives us the same
"no real API calls" guarantee with zero risk.
