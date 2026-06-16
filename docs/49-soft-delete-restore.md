# 49 — Soft-delete + restore (Arsip)

Permintaan: **semua delete harus soft-delete + restore (100%)**. Sebelumnya 0 tabel
punya soft-delete (cuma `workspace.status archived`), 11 tabel hard-delete tanpa restore.

## Pola standar

- Kolom `deleted_at timestamptz` (nullable) di tabel entitas user-facing.
- **Delete** = set `deleted_at = now()`. **Restore** = set `deleted_at = NULL`.
- **List read** memfilter `deleted_at IS NULL`; `?archived=1` menampilkan HANYA yang
  diarsip (tampilan **Arsip**).
- UI: tombol **"Lihat arsip"** per-list + aksi **Arsipkan / Pulihkan** (pilihan user:
  toggle per-list, bukan halaman /trash terpusat).

> Tabel log/event append-only (audit_log, ai_usage, engagement_event, credit_grant,
> *_event) **tidak** dapat soft-delete (N/A — memang tak dihapus user).

## Backend (generic, bukan per-tabel)

- `lib/db/soft-delete.ts` — registry `ARCHIVABLE` (entity → table) + `setArchived(ctx,
  entity, id, archived)` (tenant-scoped) + predikat `notDeleted/onlyDeleted`.
- `POST /api/data/archive` `{ entity, id, restore? }` — satu endpoint untuk semua
  entitas (`data.write`). Idempotent, tenant-scoped.
- Migrasi: `scripts/add-soft-delete.mjs` (ALTER … ADD COLUMN IF NOT EXISTS) +
  drizzle `0025_add_soft_delete.sql`.

## Cakupan Wave 2a (sudah jalan + teruji)

Kolom `deleted_at` ditambah ke 9 tabel: **contacts, company, person, deals, cadences,
quote, product, kb, workspace**.

Read filter aktif: contacts, people, companies, deals, cadences (semua dukung
`?archived=1`).

UI penuh: **/contacts/profiles** (Orang + Perusahaan) — toggle "Lihat arsip" +
tombol Arsipkan/Pulihkan di sidebar detail.

**Verifikasi:** `tsc` 0, lint bersih, `next build` hijau, dan **uji round-trip ke DB
live**: archive → hilang dari aktif (101→100) + masuk arsip (0→1) → restore → kembali
(101). PASS.

## Sisa (Wave 2b)

UI Arsip untuk: pipeline (deals), cadences, penawaran (quote), produk, KB, workspace,
dan contacts (dengan pemisahan **Arsipkan** vs **Hapus permanen (UU PDP)** — erasure
tetap hard-delete untuk kepatuhan).
