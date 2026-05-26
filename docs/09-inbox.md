# 09 — Unified inbox (crown jewel)

The demo's longest beat — and the feature build.md §5.3 explicitly says to
**spend the most polish on**. Three panes that share state via the route:

```
┌──────────────────┬─────────────────────────┬─────────────────┐
│ ConversationList │ MessageThread           │ ContactPanel    │
│  (always)        │   /inbox/[id]           │   xl: visible   │
└──────────────────┴─────────────────────────┴─────────────────┘
```

The persistent list lives in `app/(app)/inbox/layout.tsx`, the thread + panel
in `app/(app)/inbox/[id]/page.tsx`.

## `ConversationList`

- Search input + 6 filter chips: Semua · WhatsApp · Email · Instagram ·
  LinkedIn · Belum dibaca.
- Each row: avatar with overlaid channel-dot ring, name, last-message
  preview (line-clamp-2), `formatConversationTime` (today → `14:30`,
  yesterday → `Kemarin`, else `15 Mei`), unread badge.
- Active row highlight from `usePathname.split("/")[2]`.

## `MessageThread`

Channel-themed top bar (background tinted with the channel color at 7% alpha)
+ messages + a channel-matched composer.

| Channel | Bubble style |
|---|---|
| **WhatsApp** | Thread bg `#ECE5DD` · outgoing `#D9FDD3` · incoming white border · check-check status icons |
| **Email** | Threaded card view with sender + subject + body + attachment chip |
| **Instagram / LinkedIn / SMS** | Generic DM bubbles; outgoing uses the channel color with white text |

Sending appends a real outgoing bubble locally (`setSent`) — demo step 5
*"Reply in WA — show channel-themed compose"* lands instantly.

## `ContactPanel`

Toggleable via `useUiStore.inboxPanelOpen`. Surfaces the exact line the
presenter delivers in demo step 6:

> "Sumber: **Event Arsa Tower** · Disetujui **15 Mei 2026**"

Plus consent badge, contact info, related deal card (linking to `/pipeline`),
**Tambah ke cadence** button (toast), and **Lihat di Kontak** link.

## Files

```
components/inbox/conversation-list.tsx
components/inbox/message-thread.tsx
components/inbox/contact-panel.tsx
app/(app)/inbox/layout.tsx          persistent list rail
app/(app)/inbox/page.tsx            EmptyState placeholder
app/(app)/inbox/[id]/page.tsx       wires thread + panel together
```
