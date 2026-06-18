# 52 — Compliance per-tenant + DPO access + live erasure queue

**Temuan audit (LOGIC-AUDIT §2c + §4):** Data kepatuhan (consent log, DPIA, vendor risk) bersifat **global** (mock bersama), halaman di-gate **hanya Superadmin**, dan "Antrean hak hapus" adalah konstanta statis 3 baris yang tak pernah berubah. Padahal UU PDP No. 27/2022 menjadikan kepatuhan **kewajiban per data controller (per tenant)**, dan hak hapus (DSAR) itu time-bound.

## Yang diperbaiki

### 1. Per-tenant (bukan global lagi)
Tiga tabel DB baru, **tenant-scoped**: `consent_log`, `dpia`, `vendor_risk` (`lib/db/schema.ts`, migrasi `drizzle/migrations/0027_compliance_register.sql`). Setiap tenant adalah controller-nya sendiri dan hanya melihat barisnya sendiri.

Pola baca = sama dengan fitur DB lain: route memfilter `tenantId` eksplisit (RLS mati), dan **seed-fallback per-slice** saat tenant belum punya baris (demo tetap terisi). Tenant yang sudah punya barisnya sendiri hanya melihat itu — isolasi nyata.

### 2. Akses DPO (bukan cuma Superadmin)
Halaman sekarang dibuka ke peran **DPO** — `tenant_owner` / `tenant_admin` — lewat permission `data.export` ("export / DSAR"), bukan platform Superadmin saja.
- Server: route `GET /api/tenant/compliance` di-guard `requirePermission("data.export")`.
- Client: komponen baru `components/auth/require-role.tsx` (`RequireRole allow={["Superadmin","Admin","Sales Manager"]}`) menggantikan `RequireSuperadmin` di halaman ini. Peta peran (`mapDemoRole`) sejalan: Sales Rep (`member`) tetap ditolak.

### 3. Antrean hak hapus = LIVE
"Antrean hak hapus data" sekarang berasal dari **tabel `suppression` tenant** (opt-out + `dsar_delete`/`dsar_erasure` yang benar-benar diproses platform), bukan konstanta 3 baris. KPI "Permintaan hapus" = jumlah antrean live. Kosong → "Tidak ada permintaan hapus tertunda" (jujur), dengan sample hanya saat belum ada baris sama sekali. Backend DSAR (`exportSubject`/`deleteSubject`) + retensi sudah ada di route POST yang sama.

### 4. Bonus: tutup kebocoran audit lintas-tenant
`recentAudit()` memilih dari `audit_log` **tanpa filter tenant** (RLS mati) → jejak audit sensitif bocor antar-tenant. Ditambah `where(eq(tenantId))`.

## Berkas
- `lib/db/schema.ts` — `consentLogTable`, `dpiaTable`, `vendorRiskTable` (+ migrasi 0027).
- `app/api/tenant/compliance/route.ts` — GET diperluas: register tenant-scoped + erasure queue live + audit nyata (POST DSAR tetap).
- `lib/compliance/audit.ts` — `recentAudit` di-scope tenant.
- `lib/api-mock/hooks.ts` — `useCompliance()` (live, `data.export`-gated).
- `components/auth/require-role.tsx` — guard multi-peran (generalisasi `RequireSuperadmin`).
- `app/(app)/settings/compliance/page.tsx` — guard DPO, pakai `useCompliance()`, antrean hak hapus live, KPI dari data nyata.

## Catatan operasional
Tabel baru perlu migrasi dijalankan (`npm run db:migrate` atau `db:push`) untuk persistensi nyata. Tanpa DB / sebelum migrasi, route otomatis seed-fallback sehingga demo tetap jalan. Belum ada UI create/edit untuk DPIA/vendor (di luar lingkup) — barisnya per-tenant & persisten begitu diisi; reads sudah ketat tenant-scoped.
