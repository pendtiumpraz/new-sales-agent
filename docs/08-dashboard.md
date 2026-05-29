# 08 — Dashboard (bento)

`/dashboard` is an **asymmetric bento layout** — tiles of varied sizes rather
than four identical KPI cards over a table. Sourced from the derived
`useDashboard()` query plus `useTasks` / `useActivity` / `useConversations`.

## Layout

```
Channel quick-filter chips  (Semua · WhatsApp · Email · Instagram · Tokopedia)

Band 1 (12-col):
  ┌ Pipeline hero (col-span-5) ┐ ┌ stat cluster 2×2 (col-span-7) ┐
  │ Rp 45,6 M  +12,4% (teal)   │ │ WA% · Closing · Cadence · Kontak│
  │ coral→teal stage bar       │ └─────────────────────────────────┘
  └────────────────────────────┘

Band 2 (12-col):
  ┌ Tugas hari ini (col-span-7) ┐ ┌ Funnel (col-span-5) ┐

Band 3:
  └ Aktivitas terbaru (full width) ┘
```

## Pieces

- **Pipeline hero** — big `formatIDRCompact` value, a teal `+%` badge, and a
  **stage-distribution mini-bar** (coral→teal segments with a legend) computed
  from the funnel counts.
- **Stat cluster** — four tiles with channel/brand-accented icon chips: Respon
  WhatsApp (green), Closing minggu ini (teal), Cadence aktif (amber), Kontak
  dalam cadence (blue).
- **Channel quick-filters** — pills that filter the activity feed by channel
  (and show a channel badge on the activity card when active).
- **Tugas hari ini** — 8 tasks; each title links to the first conversation on
  its channel (demo step 4); checkboxes toggle a local done-set; priority badges.
- **Funnel** — Recharts `<FunnelChart>` (coral→teal ramp), dynamically imported
  `ssr:false` with a skeleton fallback.
- **Aktivitas terbaru** — recent events, filtered by the channel chips.
