# 10 — Contacts

`/contacts` is the data-density showcase: 500 Indonesian contacts in a
filter-sidebar + sortable table layout (build.md §5.4).

## Filters (left sidebar)

Three checkbox groups, all live:

- **Status persetujuan** — consented / pending / none
- **Industri** — derived uniques from the data
- **Kota** — derived uniques from the data

Plus a top-of-table search across name, company, and title.

## Table (`@tanstack/react-table`)

Columns: **Nama** (avatar + name) · Perusahaan · Jabatan · **Channel** (dot
+ label) · Aktivitas (`formatRelativeID`) · Persetujuan (`<ConsentBadge>`).
Sorting via `getSortedRowModel`, 10 rows per page via `getPaginationRowModel`.

Row click → opens `<ContactDetailSheet>`. The checkbox column uses
`stopPropagation` so selecting doesn't open the sheet.

## Selection & bulk actions

Selection lives in a local `Set<string>` (works across pages). When non-empty,
a bulk-action bar appears with three actions:

- **Ke cadence** — toast
- **Export CSV** — generates a real CSV `Blob`, triggers `URL.createObjectURL`
  download, and revokes the URL
- **Hapus** — opens a `<Dialog>` that frames deletion in **UU PDP** terms
  ("Sesuai UU PDP, data pribadi akan dihapus permanen…") before confirming

## `ContactDetailSheet`

Right `<Sheet>`. Top: centered avatar, name, title, consent badge. Below:
contact info rows, tags, channel preference card, **PDP consent block**, a
4-step mock sequence-history timeline, and a sticky footer with
**Tambah ke cadence** + **Kirim WhatsApp**.

## Files

```
app/(app)/contacts/page.tsx
components/contacts/contact-detail-sheet.tsx
```
