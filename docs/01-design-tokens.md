# 01 — Design tokens (Expressive Dark)

The visual foundation. The prototype runs an **Expressive Dark** theme — a
Material-3-derived dark palette in mauve / plum, with pill-shaped controls,
large rounded surfaces, and glassmorphic chrome.

> The original build.md spec was light-mode-only; this theme supersedes it.

## Palette → Tailwind

`tailwind.config.ts` maps shadcn's semantic tokens (`background`, `foreground`,
`primary`, `card`, `border`, `muted`, `accent`, `tertiary`, …) to **HSL CSS
variables** defined in `app/globals.css`. HSL triplets (not hex) are used so
opacity modifiers keep working (`bg-primary/90`, `bg-success/15`, …).

| Token | Value | Source |
|---|---|---|
| `--background` | `330 47% 7%` | `#190911` surface |
| `--foreground` | `336 100% 93%` | `#ffdce9` on-surface |
| `--card` | `331 39% 12%` | surface-container |
| `--primary` | `334 100% 87%` | `#ffbcd9` (light pink) |
| `--primary-foreground` | `329 37% 31%` | `#6c3250` (dark mauve text on pink) |
| `--muted` / `--accent` | `331 37% 14%` / `331 35% 17%` | tonal layers |
| `--secondary` | `331 35% 20%` | surface-bright (active states) |
| `--muted-foreground` | `336 32% 71%` | `#cd9eb1` |
| `--destructive` | `351 95% 71%` | error `#fd6f85` |
| `--tertiary` | `173 89% 76%` | `#87fff0` — input focus rings + accents |
| `--border` / `--input` | `333 23% 31%` | outline-variant |

**Tonal layering** conveys depth (design §Elevation): `background (7%) < card
(12%) < muted (14%) < accent (17%) < secondary (20%)` — surfaces closer to the
user are lighter. `color-scheme: dark` is set so native controls (scrollbars,
date pickers) render dark.

Brand/channel colors (WhatsApp green, Tokopedia green, etc.) stay fixed — they
are external identities, not theme tokens.

## Shape language — pill + expressive

`--radius: 1rem`. Components apply explicit radii on top:

- **Pill (`rounded-full`)**: buttons, inputs, selects, badges, chips, filter pills.
- **Large**: cards `rounded-xl` (1.5rem), textarea `rounded-2xl` (2rem),
  dialogs / sheets `rounded-3xl` (3rem).

## Glassmorphism

`.glass` / `.glass-strong` utilities (`backdrop-blur` + translucent `--card`)
are applied to floating chrome: the top nav, sidebar, landing header, dialogs,
sheets, and toasts (design §Elevation).

## Depth & shadows

Tailwind's `boxShadow` scale is overridden with **soft, plum-tinted** shadows
(near-black with the plum hue) so elevation reads without "mud".

## Typography

- **Inter** via `next/font/google`, exposed as `--font-sans`.
- Tabular figures (`.tnum` + `tabular-nums`) on every IDR amount / metric.

## Files

```
app/globals.css           HSL dark tokens + glass / scrollbar utilities + selection
tailwind.config.ts        token mapping + tertiary + tinted shadows + radii
lib/utils.ts              cn() helper (clsx + tailwind-merge)
components.json           shadcn config (new-york)
```
