# 07 — App shell + AI assistant

The `(app)` route group's layout wraps every desktop feature route in a
**top nav + collapsible left sidebar** (build.md §3.7: top nav + sub-nav,
nothing else).

## Layout (`app/(app)/layout.tsx`)

```
<TopNav />            sticky h-14
<flex>
  <Sidebar />        sticky, collapsible 60 ↔ 16 rem
  <main flex-1>{children}</main>
```

## `TopNav` (`components/layout/top-nav.tsx`)

- Burger button → `useUiStore.toggleSidebar`
- `BrandLogo`
- Mock search button (`⌘K` kbd hint) → `/contacts`
- `LanguageToggle`
- **Asisten** button → opens a right `<Sheet>` containing the full `<AiChat>`
- Notifications dropdown — 3 mock items with channel dots
- Profile dropdown — avatar, user info, Profil / Pengaturan / Keluar

## `Sidebar` (`components/layout/sidebar.tsx`)

Nine nav items keyed off `usePathname`. When collapsed (icon-only), each link
gets a `<Tooltip>` showing the label.

Items: Dasbor · Inbox · Kontak · Pipeline · Cadence · Sales Lapangan ·
E-commerce · Asisten AI · Pengaturan.

## AI assistant

`components/ai/ai-chat.tsx` powers two surfaces:

- The right `<Sheet>` from the top-nav **Asisten** button.
- The full-page `/ai-assistant` route (`app/(app)/ai-assistant/page.tsx`).

Behavior (build.md §5.10):

- Greeting + three suggestion chips.
- On submit, shows a 3-dot typing animation for ~700 ms, then renders a
  canned response from `matchAiResponse(prompt)` (which matches against
  trigger phrases in `ai-responses.json`).
- Unknown prompts get the default "Saya bisa bantu dengan…" reply.

## Page header

`components/layout/page-header.tsx` is the reusable title block
(`text-[28px] / 600` per build.md §3.2) used at the top of every feature
route — keeps headers visually consistent.
