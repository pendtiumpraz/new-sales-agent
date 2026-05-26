# 14 — E-commerce hub

`/ecommerce` covers build.md §5.9 — orders from Indonesian marketplaces in
one table, plus one-click cart recovery via WhatsApp (demo step 12).

## Top: 3 marketplace cards

For each of **Tokopedia · Shopee · TikTok Shop**: brand-color icon square,
name, "Terhubung" badge or "Hubungkan" button (mock — Tokopedia and Shopee
are connected, TikTok isn't), today's order count, and revenue
(`<IDRAmount compact>`).

## Below: unified orders table

40 most recent orders rendered with:

- Order ID (monospace) · Channel (`<ChannelDot>` + marketplace label) ·
  Customer · Product (×qty) · Total IDR · Date (`formatDayMonthID`) · Status
  badge (Diproses / Dikirim / Diterima / Dibatalkan).
- For rows marked `abandoned`, a **Pulihkan** button on the right.

## Cart recovery dialog

Clicking **Pulihkan** opens a `<Dialog>` that previews a pre-written
WhatsApp message styled like a real outgoing WA bubble
(`background: #D9FDD3`), addressed to the customer with their product name
inline. The send button uses the WhatsApp green `#25D366` — matching the
channel through-line. Sending fires a toast confirmation.

This single interaction sells the whole "marketplace × messaging" pitch:
abandoned cart → contextual WA recovery, no copy-paste.

## File

```
app/(app)/ecommerce/page.tsx
```
