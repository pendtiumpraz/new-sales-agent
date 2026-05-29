# 01 — Design tokens (Coral Sunset)

The visual foundation: a **bright, warm light theme** — coral primary, teal
accent, amber highlight — chosen to feel fresh, human, and distinctly *not*
generic-blue-SaaS, while reading as modern Indonesian commerce software.

## Palette → Tailwind

`tailwind.config.ts` maps shadcn's semantic tokens to **HSL CSS variables** in
`app/globals.css` (HSL triplets, so `/opacity` modifiers keep working).

| Token | Value | Source |
|---|---|---|
| `--background` | `18 100% 98%` | warm canvas `#FFF8F5` |
| `--foreground` | `24 6% 10%` | `#1B1A19` |
| `--card` | `0 0% 100%` | white surfaces |
| `--primary` | `11 96% 61%` | **coral `#FB5E3B`** (CTAs, brand, active nav) |
| `--primary-foreground` | `0 0% 100%` | white |
| `--secondary` | `24 16% 94%` | neutral warm surface (secondary buttons/badges) |
| `--muted` / `--accent` | `24 30% 96%` / `18 80% 96%` | subtle fills, hovers |
| `--muted-foreground` | `20 6% 45%` | warm grey text |
| `--destructive` | `0 84% 60%` | red `#EF4444` (kept distinct from coral) |
| `--tertiary` | `173 80% 40%` | **teal `#14B8A6`** (highlights + accents) |
| `--highlight` | `38 92% 50%` | amber `#F59E0B` |
| `--border` / `--input` | `24 24% 91%` | warm light border |
| `--ring` | `11 96% 61%` | coral focus ring |

`color-scheme: light` is set so native controls render light.

### The three brand colors

- **Primary (coral)** — main CTAs, brand mark, active pill nav, pricing emphasis.
- **Tertiary (teal)** — highlights & positives: pipeline delta, the coral→teal
  funnel + stage bar, "Live" indicator, cadence reply-rate, input focus rings,
  compliance trust cards.
- **Highlight (amber)** — `warning` badges / attention.

Channel colors (WhatsApp green `#25D366`, Tokopedia, IG, etc.) stay fixed brand
identities — the primary is intentionally coral, not green, so the channel dots
stay distinct.

## Shape & depth

`--radius: 1rem`. Pills (`rounded-full`) on buttons/inputs/badges/nav; cards
`rounded-xl`; dialogs/sheets `rounded-3xl`. Tailwind `boxShadow` is a soft,
warm-neutral light-mode scale. `.glass`/`.glass-strong` (white translucent +
blur) on the top nav, modals, and toasts.

## Typography

Inter via `next/font/google` (`--font-sans`); tabular figures (`.tnum`) on every
IDR amount / metric.
