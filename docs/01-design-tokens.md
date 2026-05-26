# 01 — Design tokens

The visual foundation: a slate-based palette, teal brand, channel colors, and
12 px rounded surfaces — matching `build.md` §3.

## Palette → Tailwind

`tailwind.config.ts` maps shadcn's semantic tokens (`background`, `foreground`,
`primary`, `card`, `border`, `muted`, …) to **HSL CSS variables** defined in
`app/globals.css`, then layers on three extra families:

| Family | Use |
|---|---|
| `brand.DEFAULT` / `brand.hover` | teal-600 / teal-700 brand moments |
| `channel.*` | WhatsApp green, Tokopedia green, Instagram pink, Email indigo, LinkedIn blue, Shopee orange, TikTok black |
| `success` / `warning` / `danger` / `info` | semantic status (build.md §3.1) |

## Key values (light mode only)

```
--background : slate-50  (#F8FAFC)   page bg
--card       : white                 surface
--primary    : teal-600  (#0D9488)   brand & focus ring
--border     : slate-200 (#E2E8F0)
--radius     : 0.75rem               12 px cards (build.md §3.3)
```

Dark mode is intentionally out of scope (build.md §10).

## Typography

- **Inter** loaded via `next/font/google` and exposed as `--font-sans`.
- Tabular figures (`tabular-nums` + `.tnum` utility) on every IDR amount, so
  digits don't dance between rows.

## What you won't find

- No gradients · no glass · no hero illustrations with floating shapes (§3.7).
- No `tailwindcss-animate` v4 / `tw-animate-css` mismatch — we use the
  Tailwind 3-compatible `tailwindcss-animate` plugin.

## Files

```
tailwind.config.ts        token mapping + channel/brand extras + animations
app/globals.css           HSL CSS variables + base styles + scrollbar utilities
lib/utils.ts              cn() helper (clsx + tailwind-merge)
components.json           shadcn config pinned to new-york / slate
```
