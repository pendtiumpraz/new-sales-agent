# 08 — Dashboard

`/dashboard` is the demo's second beat — the presenter says *"today my team
has 8 follow-ups"* and points at the task list.

## Layout (build.md §5.2)

```
PageHeader (Dasbor + "Buat cadence" CTA)
[ KPI · KPI · KPI · KPI ]                 4-col on lg
[ Tugas hari ini (col-span-2)  |  Funnel Pipeline ]
[ Aktivitas terbaru                                 ]
```

## KPI cards (`<KpiCard>`)

Each card: a tinted icon square, label, big tabular value, and a sub-line.

1. **Nilai Pipeline** — `formatIDRCompact(pipelineValue)` + `+12.4% vs bulan lalu`
2. **Closing minggu ini** — count + total IDR for deals with `expectedClose ≤ +7d`
3. **Respon WhatsApp** — `87%` + unread WA count
4. **Cadence aktif** — count + total enrolled

All numbers come from `useDashboard()` — a single derived query in
`lib/api-mock/hooks.ts`.

## Today's tasks

8 mock tasks from `tasks.json`. Each row:

- Checkbox (toggles a local `Set<string>` of done ids)
- `ChannelDot` for the task's channel
- Title + contact name **wrapped in a `<Link>` to `/inbox/<firstConversationOfThatChannel>`**
  — this powers demo step 4: *"Click first task → opens an inbox WhatsApp thread."*
- Priority badge · due column

## Funnel chart

`components/dashboard/pipeline-funnel.tsx` — a Recharts `<FunnelChart>` with
five teal shades for the five pipeline stages. **Dynamically imported with
`ssr: false`** to avoid SSR sizing warnings; a `<Skeleton>` shows during load.

## Activity feed

10 latest events from `activity.json` with `formatRelativeID` timestamps and a
channel dot where applicable.
