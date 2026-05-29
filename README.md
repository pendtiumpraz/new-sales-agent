# Agentic Sales AI — Prototype

A clickable, visually-polished Next.js prototype of an Indonesia-focused, WhatsApp-first sales intelligence platform. Built from the spec in [`build.md`](./build.md) as a 6-minute investor / user-test demo — **not** production code.

> "Apollo's prospecting power + Mekari's local channel-stack."

---

## What this is (and isn't)

| Is | Isn't |
|---|---|
| A fully navigable Next.js 14 app | A real product (no auth, no billing, no real APIs) |
| Mock data, mock AI responses, mock WhatsApp | A WhatsApp BSP-connected system |
| Designed for screen recording + live demo | Hardened for security or scale |
| Bahasa Indonesia default with EN toggle on landing | English-only |

## The demo path

The whole product is designed around one bulletproof 6-minute walkthrough:

1. `/` — landing page with EN toggle
2. **Coba Demo** → `/dashboard` — KPIs, today's tasks, pipeline funnel
3. Click a WhatsApp task → `/inbox/<id>` — channel-themed thread
4. Reply in WA — outgoing bubble appended live
5. Click contact → side panel surfaces *"Sumber: Event Arsa Tower, Disetujui 15 Mei 2026"*
6. `/pipeline` — drag a deal between stages (persisted in Zustand)
7. `/cadences/new` — drag WA + email + call steps, **Bantuan AI** generates Bahasa drafts
8. `/field` — Leaflet map with reps in Jakarta + Surabaya
9. **Buka tampilan mobile** → `/m` — daily schedule inside an iPhone-14 frame
10. `/ecommerce` — Tokopedia/Shopee/TikTok orders + one-click WhatsApp cart recovery
11. `/settings/compliance` — **94 / 100 UU PDP**

## Tech stack

Next.js 14 (App Router) · TypeScript strict · Tailwind 3.4 + classic shadcn/ui (Radix) · Zustand · TanStack Query + Table · react-hook-form + zod · Recharts · @dnd-kit · react-leaflet · next-intl · framer-motion · sonner · faker.js seed script.

## Quick start

```bash
npm install
npm run seed     # regenerate the mock JSON files (deterministic, seed: 2026)
npm run dev      # http://localhost:3000 (Turbopack — fast compiles)
npm run preview  # production build + serve — use this for demos (instant nav)
```

> **Demo tip:** `npm run dev` compiles each route on first visit, so the *first*
> click to a page can take a few seconds. For a smooth live demo run
> `npm run preview` (production build) — client-side navigation is then instant.
> If `next start` ever 500s with `MODULE_NOT_FOUND: _document`, clear the stale
> cache: `rm -rf .next` then rebuild.

## File map

```
app/(marketing)/page.tsx          Landing
app/login/page.tsx                Mock auth — any creds → /dashboard
app/(app)/                        Desktop shell + 9 feature routes
app/m/                            Mobile rep app (rendered inside PhoneFrame)
components/ui/                    21 classic shadcn/Radix primitives
components/{inbox,pipeline,cadences,contacts,dashboard,field,mobile,layout,shared,ai}/
lib/{types,utils,api-mock,stores,mock-data}/
messages/{id,en}.json             next-intl bundles
scripts/generate-mock-data.ts     Seeded faker generator
```

## Per-feature documentation

Each commit in this repo introduces one feature, accompanied by an explainer in [`docs/`](./docs):

- [01 — Design tokens](./docs/01-design-tokens.md)
- [02 — UI component library](./docs/02-ui-library.md)
- [03 — Shared formatters & components](./docs/03-shared.md)
- [04 — Mock data & API layer](./docs/04-mock-data.md)
- [05 — Foundation (layout, providers, i18n)](./docs/05-foundation.md)
- [06 — Marketing landing + login](./docs/06-marketing.md)
- [07 — App shell + AI assistant](./docs/07-app-shell.md)
- [08 — Dashboard](./docs/08-dashboard.md)
- [09 — Unified inbox (crown jewel)](./docs/09-inbox.md)
- [10 — Contacts](./docs/10-contacts.md)
- [11 — Pipeline kanban](./docs/11-pipeline.md)
- [12 — Cadence builder](./docs/12-cadences.md)
- [13 — Field sales + mobile rep app](./docs/13-field-mobile.md)
- [14 — E-commerce hub](./docs/14-ecommerce.md)
- [15 — Settings + UU PDP compliance](./docs/15-settings-compliance.md)
- [16 — Content creation & planning](./docs/16-content.md)
- [17 — Prospecting / lead intelligence (Apollo-like)](./docs/17-prospecting.md)

### Guides

- [**Use-case flows**](./docs/USE-CASES.md) — how each feature is used (persona → trigger → steps → outcome)
- [**Live demo script**](./docs/DEMO-SCRIPT.md) — presenter-ready, click-by-click walkthrough (~8–9 min)

## Notable deviations from the spec

Two pragmatic substitutions, both flagged in the docs:

- **MSW → React Query + `lib/api-mock`**. MSW's service-worker registration is the #1 source of flakiness in Next 14 App Router; the demo is bulletproof without it. Hooks expose the same shape (`useContacts`, `useDeals`, …) with simulated latency.
- **Latest shadcn CLI → classic Radix new-york**. `shadcn@4.8`'s default "base-nova" style pulls Base UI + Tailwind v4 CSS, which is incompatible with the locked Tailwind 3.4 + Next 14 stack. Classic Radix-based shadcn with the slate HSL palette maps 1:1 to the build.md design system.

## Out of scope (per build.md §10)

Real auth · real WhatsApp / Meta API · real email · real LLM · CRM imports · payments · multi-tenancy · analytics · WCAG audit · dark mode · tests.
