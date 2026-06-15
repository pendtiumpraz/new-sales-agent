# 19 — Multitenancy & RBAC (vision)

> Status: design spec. Fondasi semua layer lain. Lihat [overview](./18-saas-architecture-overview.md).

## Isolasi tenant — shared DB + Row-Level Security

Pilihan: **shared database, satu `tenant_id` di tiap tabel, ditegakkan Postgres
RLS.** Bukan schema-per-tenant / DB-per-tenant.

**Kenapa:** stack udah Neon Postgres + Drizzle. RLS bikin isolasi ditegakkan di
**lapisan DB** (bukan cuma `WHERE` di app — yang gampang lupa & jadi lubang
kebocoran data antar-tenant). Schema/DB-per-tenant baru worth it kalau ada tenant
enterprise yang nuntut isolasi fisik; itu bisa jadi tier "Enterprise" nanti tanpa
ganti model dasar.

```sql
-- pola tiap tabel ber-tenant
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON companies
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

App nge-set `app.tenant_id` (dan `app.user_id`, `app.role`) per-request dari
session sebelum query. Di Drizzle: bungkus koneksi supaya tiap transaksi nge-`SET
LOCAL app.tenant_id = ...` dulu. **Superadmin** pakai role DB terpisah yang
bypass RLS (lihat doc [26]).

## Entity inti

```
tenant        (id, name, plan, status, created_at)
user          (id, email, name, status)                 -- identitas global
membership    (tenant_id, user_id, role, status)         -- user ⨯ tenant (many-to-many)
invite        (tenant_id, email, role, token, expires_at)
audit_log     (tenant_id, actor_user_id, action, target, meta, at)
```

Satu `user` (email) bisa jadi anggota banyak `tenant` (konsultan/agency). Role
nempel di **`membership`**, bukan di user — jadi orang yang sama bisa `owner` di
tenant A dan `member` di tenant B. Persis permintaanmu "tiap tenant bisa nambahin
user yang bantu di dalamnya" → alur `invite` → terima → `membership`.

## Role & permission

| Role | Scope | Bisa apa |
|------|-------|----------|
| `superadmin` | Platform | Semua tenant, log, infra, AI cost, pricing, kill-switch. Doc [26]. |
| `tenant_owner` | 1 tenant | Billing, hapus tenant, atur semua member & integrasi. |
| `tenant_admin` | 1 tenant | Kelola member, mailbox, AI key, cadence, data. Tanpa billing. |
| `member` | 1 tenant | Kerja: prospek, contacts, cadence, kirim dari mailbox sendiri. |

`member` bisa di-sub-scope lewat **permission flags** (atau sub-role: `rep`,
`manager`, `viewer`) — mis. `viewer` read-only, `manager` boleh lihat data semua
rep. Mulai dari 4 role di atas; pecah jadi flag granular saat butuh.

**Enforcement berlapis:**
1. **DB:** RLS (anti kebocoran antar-tenant).
2. **API:** middleware cek `membership.role` + permission per route handler.
3. **UI:** sembunyikan aksi yang gak diizinkan (UX, bukan security).

## Auth

Prototype sekarang mock login (any creds → `/dashboard`). Target: auth nyata
(mis. Auth.js/NextAuth atau Clerk/WorkOS untuk SSO enterprise) yang ngisi session
→ dari situ `tenant_id` + `role` di-inject ke RLS context tiap request.

## Target modules

```
lib/db/schema.ts            +tenant, membership, invite, audit_log; +tenant_id di semua tabel
lib/db/rls.ts               wrapper koneksi: SET LOCAL app.* per transaksi
lib/auth/                   session → {tenant_id, user_id, role}
lib/rbac/                   permission matrix + guard helpers (requireRole/requirePermission)
app/api/**                  tiap handler lewat guard
app/(app)/settings/team     UI kelola member + invite (extend settings existing)
```
