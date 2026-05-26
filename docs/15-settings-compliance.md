# 15 — Settings + UU PDP compliance

The demo's final beat: ending on the **94/100 UU PDP** score that "banks love"
(build.md §9 step 13, §5.11).

## `/settings/compliance`

Four sections:

1. **Compliance score + summary**
   - Custom `<ScoreGauge>` (SVG donut, teal `strokeDasharray` arc) showing
     **94 / 100** + "Sangat baik".
   - Six mini-stat cards: consented % · pending % · none % · permintaan hapus ·
     versi kebijakan · audit count.

2. **Right-to-delete queue** — 3 mock pending requests with "Tolak" /
   "Proses hapus" buttons; both fire toasts framed in PDP language.

3. **Log persetujuan** — `<Table>` of 50 entries from `consent-log.json`
   (contact, source, date in Bahasa, version, `<ConsentBadge>`), scrollable
   within the card.

4. **Jejak audit** — 7 hardcoded recent operations with relative timestamps.

The header carries the "Export laporan PDPA" button (mock PDF — toast).

## `/settings`

A lean settings overview with four `<Tabs>`:

- **Umum** — workspace inputs + a click-through card to `/settings/compliance`
  with the 94/100 score as a teaser.
- **Pengguna** — 4 mock team members with roles.
- **Integrasi** — channel rows (WA, Email, IG, Tokopedia, Shopee, TikTok)
  each with a `<Switch>`. Already-on by default for what the demo expects.
- **Tagihan** — current Growth plan card showing `<IDRAmount>` 449.000/bln,
  10 active users, next invoice date, total bulan ini.

The Profile dropdown in the top nav links here, so this page is reachable
from every screen.

## Files

```
app/(app)/settings/page.tsx
app/(app)/settings/compliance/page.tsx
```
