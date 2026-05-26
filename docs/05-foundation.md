# 05 — Foundation (layout, providers, i18n, stores)

The app's bones: a single root layout, a client-side `Providers` shell, an
in-memory Zustand UI store, and `next-intl` for the EN toggle.

## Root layout (`app/layout.tsx`)

- Loads **Inter** via `next/font/google`, exposed as `--font-sans`.
- Sets `<html lang="id">` (default) with `suppressHydrationWarning`.
- Wraps children in `<Providers>` (client).

## `Providers` (`app/providers.tsx`, client)

Composes three context providers + the Toaster:

1. **`QueryClientProvider`** — single QueryClient with `staleTime: 60_000`,
   `refetchOnWindowFocus: false`, no retries (the data never changes).
2. **`NextIntlClientProvider`** — locale driven by `useUiStore`, both JSON
   bundles imported eagerly so toggling is instant. `timeZone="Asia/Jakarta"`.
3. **`TooltipProvider`** with `delayDuration={200}`.
4. **`<Toaster />`** from sonner (top-right, 4 s auto-dismiss).

The `next-intl` provider runs in **client-only mode** — no `[locale]` URL
segment, no middleware. The toggle flips a Zustand value and the provider
re-renders the tree with the new message bundle.

## Zustand (`lib/stores/ui-store.ts`)

In-memory only — build.md hard rule (§2) forbids `localStorage`.

| Slice | Used by |
|---|---|
| `locale` / `setLocale` / `toggleLocale` | `LanguageToggle`, `Providers` |
| `sidebarCollapsed` / `toggleSidebar` | TopNav burger ↔ Sidebar width |
| `aiPanelOpen` / `setAiPanelOpen` | reserved |
| `inboxPanelOpen` / `toggleInboxPanel` | Inbox contact panel show/hide |

`lib/stores/pipeline-store.ts` (added with the kanban feature) seeds from
`deals.json` and persists drag-drop moves for the session.

## i18n bundles (`messages/`)

`id.json` (default) + `en.json` cover landing copy and nav chrome. Internal
pages keep Bahasa hardcoded — the EN toggle's required surface per build.md §11
is the landing page.
