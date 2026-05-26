# 11 — Pipeline kanban

`/pipeline` is demo step 7 — the presenter drags a deal from **Penawaran**
to **Negosiasi** and the column totals update live (build.md §5.5).

## Architecture

```
PipelinePage
└── KanbanBoard (DndContext + DragOverlay)
    └── Column[5]    each is a useDroppable
        └── DraggableCard    useDraggable, opens DealDetailSheet on click
```

## Persistence

`lib/stores/pipeline-store.ts` is a Zustand store seeded from `deals.json`:

```ts
moveDeal(id, stage)   // mutates the store; column totals recompute
```

Drag moves persist for the session — exactly what build.md §11 calls for
("Pipeline drag-drop persists in session"). Refresh resets, as intended.

## DnD details

- `PointerSensor` with `activationConstraint: { distance: 8 }` — clicks still
  open the deal sheet, only larger movement starts a drag.
- `DragOverlay` shows a tilted clone of the card following the cursor; the
  original card dims to 40% opacity, eliminating layout thrash.
- `closestCorners` collision so cards drop into a column when most of the
  cursor area is over it.

## Columns

Five stages, each with: name · count badge · `formatIDRCompact` total. Empty
columns show "Tarik deal ke sini" with a dashed border that turns teal on
drag-over (`isOver`).

## Card content

`<CardInner>` (shared between live card and drag overlay): deal name,
channel-source `<ChannelDot>`, company, **`<IDRAmount compact>`** in teal,
expected-close date, owner avatar + name.

## `DealDetailSheet`

Right Sheet — sourceChannel header, deal title, big IDR amount, four info
rows (contact, company, expected close, owner), a **stage `<Select>`** wired
to `moveDeal` (alternate way to change stage from the demo), a 4-step
activity log, and footer buttons (**Tandai menang** moves to `tutup` + toast,
**Kirim follow-up**).

## Files

```
lib/stores/pipeline-store.ts
components/pipeline/kanban-board.tsx
components/pipeline/deal-detail-sheet.tsx
app/(app)/pipeline/page.tsx
```
