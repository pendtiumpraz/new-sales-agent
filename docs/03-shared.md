# 03 — Shared formatters & components

Cross-cutting building blocks used by every feature: the design through-line.

## Domain types

`lib/types.ts` declares the data shapes mirrored by the mock JSON:
`Contact`, `Deal`, `Conversation`, `Message`, `Cadence`, `CadenceStep`,
`FieldRep`, `Visit`, `Order`, `AiResponse`, `ConsentEntry`, `Task`,
`ActivityEvent`, plus enums (`MessagingChannel`, `Marketplace`,
`ConsentStatus`, `DealStage`).

## Formatters (`lib/utils/`)

| Function | Output |
|---|---|
| `formatIDR(1_250_000)` | `Rp 1.250.000` (dots, no decimals — build.md §3.5) |
| `formatIDRCompact(2e9)` | `Rp 2 M` · `Rp 250 jt` · `Rp 1,25 jt` (kanban cards) |
| `formatDateID('2026-05-15')` | `15 Mei 2026` |
| `formatTimeID(d)` | `14:30 WIB` (24-hour) |
| `formatConversationTime(d)` | `14:30` / `Kemarin` / `15 Mei` |
| `formatRelativeID(d)` | `5 menit lalu` (date-fns `id` locale) |

## Channel config — the visual through-line

`lib/utils/channel-config.ts` is the single source of truth for every channel's
**label · color · icon**. The `ChannelDot` component reads it; rows in the
inbox, contacts, dashboard, pipeline, and notifications all get a tiny 8 px
colored dot from this map (build.md §3.3).

> Lucide v1.x removed brand icons over trademark; we substituted `Camera`
> (Instagram) and `Briefcase` (LinkedIn) — still rendered in brand colors.

## Shared components (`components/shared/`)

| Component | Role |
|---|---|
| `ChannelDot` | 8 px colored dot — the through-line |
| `IDRAmount` | tabular-figure Rupiah amount |
| `ConsentBadge` | green / amber / red PDP consent pill (`pill` or `dot`) |
| `UserAvatar` | colored-initials avatar (no real photos) |
| `BrandLogo` | teal mark + "Agentic Sales" wordmark |
| `LanguageToggle` | ID / EN segmented switch wired to Zustand |
| `EmptyState` | icon + headline + CTA (never just "No data") |
| `PhoneFrame` | iPhone-14-ish wrapper (390×844) for the mobile rep app |
