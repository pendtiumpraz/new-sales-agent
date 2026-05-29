# 07 — App shell (top nav) + AI assistant

The `(app)` route group wraps every desktop feature route in a **horizontal
top navigation bar** — no sidebar. This frees the full width for the dense
surfaces (inbox, kanban, tables) and gives the app a fresher, less-generic feel.

## Layout (`app/(app)/layout.tsx`)

```
<TopNav />           sticky, glass, h-14
<main>{children}</main>   full width
```

## `TopNav` (`components/layout/top-nav.tsx`)

A single glass bar, sticky at top:

- **Brand** mark (left).
- **Pill navigation** — the 8 primary destinations as rounded pills
  (Dasbor · Inbox · Kontak · Pipeline · Cadence · Konten · Sales Lapangan ·
  E-commerce), keyed off `usePathname`. Active = coral fill; the row is
  horizontally scrollable and collapses to icon-only below `lg` so it never
  overflows. Labels show from `lg` up.
- **Right cluster** — command search (⌘K, routes to contacts), language toggle,
  the **Asisten** button (opens a right `<Sheet>` with `AiChat`), notifications
  dropdown (channel-dotted), and a profile dropdown (Profil / Pengaturan /
  Kepatuhan UU PDP / Keluar).

The AI assistant (`components/ai/ai-chat.tsx`) still powers both the slide-over
and the `/ai-assistant` route — greeting, suggestion chips, ~700 ms typing
animation, canned `matchAiResponse` replies.

`PageHeader` (`components/layout/page-header.tsx`) remains the per-page title
block used at the top of each route.

> The sidebar from the original build was removed; `useUiStore`'s
> `sidebarCollapsed`/`toggleSidebar` remain but are unused.
