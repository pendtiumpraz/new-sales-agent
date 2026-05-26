# 02 — UI component library

21 classic shadcn/ui primitives (Radix + cva + Tailwind 3) hand-written under
`components/ui/`. We deliberately did **not** use `shadcn@latest init` — that
ships the new "base-nova" style which uses Base UI and Tailwind v4 CSS and
breaks against our Tailwind 3.4 / Next 14 lock.

## What's included

| Form & input | Layout | Overlay | Display | Feedback |
|---|---|---|---|---|
| `button` | `card` | `dialog` | `badge` | `sonner` Toaster |
| `input` | `separator` | `sheet` | `avatar` | `skeleton` |
| `textarea` | `scroll-area` | `popover` | `table` | `tooltip` |
| `label` | `tabs` | `dropdown-menu` | | |
| `select` | | | | |
| `checkbox` | | | | |
| `radio-group` | | | | |
| `switch` | | | | |

All are accessible (Radix primitives), keyboard-navigable, and share the
slate / teal token map from [01](./01-design-tokens.md).

## Decisions worth noting

- **`buttonVariants` uses `bg-card` on `outline`** (not the default `bg-background`)
  so outline buttons stay legible against the page's slate-50 bg.
- **`Sheet`** is a `react-dialog` re-skin with `side: top|right|bottom|left`
  via cva — used heavily for contact/deal/cadence detail panels.
- **`Toaster`** is preconfigured for `position="top-right"` and `duration={4000}`
  per build.md §3.4.
- **Dialog/Sheet overlays** use `bg-slate-900/40 backdrop-blur-[1px]` instead of
  the usual `/80` — keeps the underlying surface legible during demos.

## Files

`components/ui/{button,card,badge,input,textarea,label,select,checkbox,
radio-group,switch,dialog,sheet,tabs,tooltip,avatar,table,separator,
scroll-area,dropdown-menu,popover,skeleton,sonner}.tsx`
