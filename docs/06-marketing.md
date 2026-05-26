# 06 — Marketing landing + mock login

## `/` — Landing page

A single client component in `app/(marketing)/page.tsx` covering everything
build.md §5.1 calls for, in this order:

1. **Sticky nav** — brand, Produk · Perbandingan · Harga, `LanguageToggle`,
   Masuk, **Coba Demo**.
2. **Hero** — title + subtitle (both translated), two CTAs, plus a
   `<HeroPreview />` mock of the unified inbox (rows with channel dots and
   unread badges) and a floating "Nilai Pipeline" stat card.
3. **Logo cloud** — 6 grey-block placeholders (Tokopedia, Bank Mandiri,
   Halodoc, Astra, Telkom, Sinar Mas).
4. **Feature grid** — 6 pillars from the deck, each `Card` + icon.
5. **Comparison table** — Apollo vs Mekari Qontak vs Agentic Sales, with
   row labels bilingual (read from `useUiStore.locale`).
6. **Pricing** — Starter / Growth (popular) / Enterprise, IDR via
   `formatIDR(199000)` / `formatIDR(449000)`.
7. **Footer** — PDP notice, social columns, another `LanguageToggle`.

Plus a `<Dialog>` "Hubungi Sales" contact form (mock — submits a sonner toast).

## EN toggle

`<LanguageToggle>` flips `useUiStore.locale`; the `NextIntlClientProvider`
re-renders the tree with `en.json`. All copy in `messages/{id,en}.json`
swaps live, no reload, no URL change.

## `/login` — Mock auth

`app/login/page.tsx`. Centered card, email + password (prefilled
`demo@agentic.co.id` / `demo1234`). Any credentials work — `setTimeout(() =>
router.push("/dashboard"), 500)` (build.md §10).

## Design rules honored

- No gradients, no hero illustrations with floating shapes (§3.7).
- Channel-color dots on every preview row.
- IDR with tabular figures via `IDRAmount` / `.tnum`.
