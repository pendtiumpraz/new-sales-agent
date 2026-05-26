# 13 — Field sales + mobile rep app

Two interconnected surfaces — demo steps 10 and 11.

## `/field` — Desktop field sales

```
PageHeader · "Log kunjungan" CTA
[ Sidebar (w-80)                 |  FieldMap (flex-1)              ]
[ Tabs (Live · Hari ini · Minggu)|                                 ]
[ Rep list (filtered by tab)     |  Leaflet map, Jakarta+Surabaya  ]
[ Selected rep footer + "Buka tampilan mobile" → /m                ]
```

### `FieldMap` (react-leaflet)

- **Dynamically imported with `ssr: false`** — Leaflet needs `window`.
- Uses **`<CircleMarker>`** instead of the default icon to sidestep
  Leaflet's broken default-icon asset URLs under Webpack.
- Status → color: kunjungan green, istirahat amber, selesai slate.
- Selecting a rep draws their day's route as a teal dashed `<Polyline>`
  through `<CircleMarker>` waypoints.

### `/field/visits`

Companion route — a sortable visit-log table with outcome badges
(berhasil / tindak-lanjut / tidak-ada).

## `/m/*` — Mobile rep app

Rendered inside `<PhoneFrame>` (iPhone-14-ish, ~390×844) on a slate
backdrop. The frame includes a dynamic island, status bar, and a fixed
bottom tab bar (`MobileTabBar`): **Beranda · Kontak · Kunjungan · Check-in**.

```
/m              Daily schedule (6 visits), MiniMap, "Mulai kunjungan" CTA
/m/check-in     GPS coords (mocked -6.2088,106.8456), MiniMap, photo placeholder,
                large "Check-in Sekarang" button → success state
/m/visits/new   Form: customer · type · notes · photo · follow-up switch
/m/contacts     Searchable list with per-row 📞 + WhatsApp shortcut buttons
                (the WA button is filled `#25D366`, matching the channel)
```

`MiniMap` is a stylized SVG snippet (no Leaflet inside the phone) — keeps
the mobile screens light and visually consistent.

## Files

```
components/field/field-map.tsx        Leaflet wrapper (CircleMarker + Polyline)
app/(app)/field/page.tsx              Map + rep sidebar + tabs
app/(app)/field/visits/page.tsx       Visit log table

components/mobile/mobile-tab-bar.tsx
components/mobile/mini-map.tsx
app/m/layout.tsx                      PhoneFrame + bottom tabs
app/m/page.tsx                        Daily schedule
app/m/check-in/page.tsx
app/m/visits/new/page.tsx
app/m/contacts/page.tsx
```
