# 12 — Cadence builder

Two routes:

- **`/cadences`** — grid of 12 cadence cards (status badge, channel-mix dots,
  enrolled count, reply-rate %). Each card links to the builder.
- **`/cadences/new`** — the builder itself.

## Builder layout (build.md §5.6)

```
PageHeader   Cadence Builder · "Simpan & Aktifkan" CTA
Input        Nama cadence
Tabs ─────────────────────────────────────────────
  Langkah                  ← grid: step list (left) · editor (right)
  Pengaturan               ← sending hours, day toggles, max/day, holiday switch
```

## Step list (sortable)

`@dnd-kit/sortable` with `verticalListSortingStrategy` — drag handle is a
`<GripVertical>` so clicking the row still selects it.

Each step row shows: order number, channel dot + label, delay
("Langsung" or "X hari setelah langkah sebelumnya"), delete button.

## Step editor (right pane)

When a step is selected:

- **Channel** select (whatsapp / email / sms / linkedin / call)
- **Tunda (hari)** numeric input
- **Subjek** (email only)
- **Isi pesan** textarea
- **Variable chips** — `{{nama}}` · `{{perusahaan}}` · `{{produk}}` insertable
  at the cursor end
- **Bantuan AI** dialog — opens a `<Dialog>` showing a rotating draft from
  the channel-specific `AI_DRAFTS` map. 600 ms shimmer for the
  "Buat ulang" action. Apply writes the draft into the step's content (toast).

This dialog is demo step 9: *"Click Bantuan AI → modal generates Bahasa cadence."*

## Settings tab

Send-start / send-stop selects (WIB), 7-button day toggle (default Sen–Jum),
max per day, "Lewati hari libur nasional" switch.

## Files

```
app/(app)/cadences/page.tsx               grid of 12 cadences
app/(app)/cadences/new/page.tsx           wraps the builder
components/cadences/cadence-builder.tsx   builder + AI assist dialog
```
