# Audit #5 / #37 — accessible dialogs: rollout status & remaining work

**Findings addressed:** AUDIT.md #5 (CRITICAL, a11y-ux) — hand-rolled drawers/modals
lack `role="dialog"`/`aria-modal`/`aria-labelledby`, focus trap, autofocus,
focus-return, and uniform scroll-lock; and #37 (MEDIUM) — inconsistent
Esc-to-close, copy-pasted `ConfirmModal`/`PurgeModal`/`DrawerShell` per page.

## What shipped

Three shared, accessible primitives in `components/shared/` wrap the existing
Radix dialog primitive (`@radix-ui/react-dialog`, same engine as
`components/ui/dialog.tsx` / `sheet.tsx`). They get for free: `role="dialog"` +
`aria-modal` + `aria-labelledby` (wired to the title), focus trap, autofocus,
focus-return to the trigger on close, uniform body scroll-lock, and
Esc-to-close + backdrop-click-to-close.

- `components/shared/app-drawer.tsx`
  - `AppDrawer` — right-side drawer with built-in header/footer chrome (drop-in
    for the old `DrawerShell` API: `{ open, onClose, icon, title, subtitle,
    footer, children, widthClassName }`).
  - `AppDrawerRaw` — same accessible shell with **no** built-in chrome, for
    drawers whose body component renders its own header (e.g. `DealDrawer`,
    `EnrichDrawer`, escalations' `DrawerBody`, the contacts detail panel). Takes
    a `title` for the (visually-hidden) accessible name.
- `components/shared/confirm-dialog.tsx` — `ConfirmDialog`, centered
  confirm/restore. Prop surface is the **superset** of the two conventions found
  in the rebuild, so it is a literal drop-in everywhere: close handler is
  `onClose` **or** `onCancel`; pending flag is `confirmPending` **or**
  `confirmDisabled` (pipeline drives its own label text).
- `components/shared/purge-dialog.tsx` — `PurgeDialog`, type-to-confirm
  destructive purge. Manages the confirm-text state internally (removes the
  `purgeConfirm`/`setPurgeConfirm` useState that leaked into every page).
  `confirmPhrase` defaults to `"HAPUS"`; admin passes the tenant slug with
  `caseInsensitive={false}`.

Visual design is intentionally identical (Coral Sunset, right-side 400–460px
drawer, same overlay/slide/zoom animations, same header/footer/button chrome).

## Pages converted (the 8 prioritized core pages — DONE)

| Page | File | Drawer | Confirm/restore | Purge |
|------|------|--------|-----------------|-------|
| Contacts | `app/(app)/contacts/page.tsx` | `AppDrawerRaw` (detail panel) | `ConfirmDialog` ×2 | `PurgeDialog` |
| Superadmin | `app/admin/page.tsx` | `AppDrawerRaw` (create/activate) | `ConfirmDialog` ×3 (suspend/delete/restore) | `PurgeDialog` (slug, case-sensitive) |
| Content | `app/(app)/content/page.tsx` | `AppDrawer` ×2 (template/plan) | `ConfirmDialog` ×4 | `PurgeDialog` |
| Reports | `app/(app)/reports/page.tsx` | `AppDrawerRaw` (save report) | `ConfirmDialog` ×2 | `PurgeDialog` |
| Escalations | `app/(app)/escalations/page.tsx` | `AppDrawerRaw` (`DrawerBody`) | `ConfirmDialog` ×2 | `PurgeDialog` |
| Pipeline | `app/(app)/pipeline/page.tsx` | `AppDrawerRaw` (`DealDrawer`) | `ConfirmDialog` ×2 (`onCancel`/`confirmDisabled`) | `PurgeDialog` |
| Enrichment | `app/(app)/enrichment/page.tsx` | `AppDrawerRaw` (`EnrichDrawer`) | `ConfirmDialog` ×2 (2 panels) | `PurgeDialog` ×2 |
| Branding | `app/(app)/branding/page.tsx` | **already** Radix `Sheet` | — | — (reset uses the Sheet) |

Branding already used the accessible Radix `Sheet` from `components/ui/sheet.tsx`
(role/focus-trap/Esc/scroll-lock all from Radix), so it needed no change and is
listed here for completeness.

All local `DrawerShell` / `DrawerBackdrop` / `ConfirmModal` / `PurgeModal`
function definitions and the per-page `purgeConfirm` useState were deleted from
the 8 pages. `npx tsc --noEmit` and `npm run lint` are green.

## Remaining (NOT yet converted)

The same hand-rolled pattern still exists on these pages. They were out of scope
for the prioritized batch; each is a mechanical repeat of the conversions above
(swap the local shell for the shared primitive, drop the local def + the
`purgeConfirm` state). No new primitives are needed.

| Page | File | Hand-rolled drawer (`<aside>`) | Local `ConfirmModal` | Local `PurgeModal` | Notes |
|------|------|:--:|:--:|:--:|-------|
| Marketplace | `app/(app)/marketplace/page.tsx` | 2 | yes | yes | most work left — 2 drawers + both modal kinds |
| Autopilot | `app/(app)/autopilot/page.tsx` | 2 | yes | — | 2 drawers; purge handled via `ConfirmModal` |
| Cadences | `app/(app)/cadences/page.tsx` | 1 | yes | — | |
| Field | `app/(app)/field/page.tsx` | 1 | yes | — | field-visit drawer |
| Retention | `app/(app)/retention/page.tsx` | 1 | yes | — | |
| Settings · Team | `app/(app)/settings/team/page.tsx` | 1 | yes | — | invite/role drawer; pairs with audit #21 (role-ceiling) |
| Ecommerce | `app/(app)/ecommerce/page.tsx` | 0 | yes | — | modal-only (no right drawer) |
| Inbox | `app/(app)/inbox/page.tsx` | 0 | yes | — | modal-only; the 2-pane shell itself is audit #17, separate |
| Settings · Knowledge Base | `app/(app)/settings/knowledge-base/page.tsx` | 0 | yes | — | **already** uses Radix `Sheet` ×5 for its drawers; only a residual centered `ConfirmModal` remains to swap to `ConfirmDialog` |

### Conversion recipe (for the remaining pages)

1. `import { AppDrawer | AppDrawerRaw } from "@/components/shared/app-drawer";`
   `import { ConfirmDialog } from "@/components/shared/confirm-dialog";`
   `import { PurgeDialog } from "@/components/shared/purge-dialog";`
2. Drawer: if the body renders its own header → `AppDrawerRaw` with
   `open`, `onClose`, `title` (accessible name), `widthClassName` (match the old
   `max-w-[…]`). Otherwise → `AppDrawer` (pass `icon`/`title`/`subtitle`/`footer`).
   Delete the `<div overlay/> + <aside>` pair and any manual Esc/scroll-lock
   `useEffect` (the primitive handles all three).
3. `ConfirmModal` → `ConfirmDialog` (props are a 1:1 superset).
4. `PurgeModal` → `PurgeDialog` with `open={!!purgeTarget}`; drop the
   `purgeConfirm`/`setPurgeConfirm` state and any `value`/`onChange` props (the
   dialog owns the confirm text and resets it on open).
5. Delete the now-unused local `*Modal`/`*Shell` function defs and prune unused
   `lucide-react` icon imports (`X`, `AlertTriangle`) if nothing else uses them.

Keep visual parity by passing the original width as `widthClassName` (e.g.
`"w-full max-w-[460px]"` for content, `"w-[420px] max-w-full"` for reports).
