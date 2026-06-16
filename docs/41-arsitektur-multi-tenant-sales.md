# Doc 41 — Arsitektur: peran, isolasi, atribusi, marketplace

Konsolidasi visi multi-tenant + monitoring sales + marketplace. Divisualkan di
**Dokumentasi** (in-app, `components/docs/architecture-diagram.tsx`). Pendamping
doc 40 (crawl/profiling) + doc 19 (multi-tenant foundation).

Status: 🟡 sebagian dibangun. Lihat §6 untuk apa yang sudah/belum.

---

## 1. Tiga peran (sudah ada di RBAC)
`lib/rbac/permissions.ts` → `superadmin | tenant_owner | tenant_admin | member`.

| Peran | = | Bisa |
|---|---|---|
| **Superadmin** | pemilik platform | semua tenant, aktivasi + kredit AI, kill-switch, **set mode deploy (SaaS/on-prem)** |
| **Manajer tenant** | `tenant_owner` (Admin) + `tenant_admin` (Sales Manager) | kelola tim, **monitor semua sales**, **boleh sales langsung** dari akunnya |
| **Sales** | `member` (Sales Rep) | eksekusi dari akun sendiri, lihat **lead miliknya saja** |

## 2. Dua level isolasi data
1. **Antar-tenant** (sudah, via `withTenant` + RLS + `tenant_id` di tiap tabel): Tenant A & B tak pernah saling lihat.
2. **Antar-sales dalam 1 tenant** (baru, `person.assigned_to` = users.id):
   - **member** hanya lihat baris `assigned_to = dirinya` (atau yang belum di-assign, sesuai kebijakan).
   - **manajer** lihat **semua** data tenant.
   - Data tetap **milik perusahaan tenant** (manajer kontrol penuh, bisa re-assign).

## 3. Dedup & kepemilikan
- Dedup **per-tenant** sudah ada (`companyDedupKey`/`personDedupKey`/`contactPointDedupKey` → `stableId`). Kontak sama yang di-crawl Sales 1 & Sales 2 → **satu baris**, tak ganda.
- Kepemilikan: lead masuk via **token per-sales** → `assigned_to` di-set ke sales itu saat ingest. Bentrok kepemilikan diputus manajer.

## 4. Akun & eksekusi per-sales
- Tiap sales **daftarkan akun LinkedIn + Instagram**-nya di web (untuk atribusi + posting/DM dari identitasnya).
- Extension pakai **token ingest per-sales** (bukan per-tenant) → crawl otomatis ter-assign.
- Eksekusi (email/WA/DM) dari **akun sales** (atau manajer) sendiri — trust + anti-ban. Default semi-auto: AI draft → approve.

## 5. Atribusi & monitoring (untuk manajer)
Karena tiap aksi ber-identitas: **sales mana aktif/idle** (heartbeat extension + `ai_usage.user_id` + log kirim), **closing dari sales mana** (`deals.owner`), **partner/lead dipegang sales mana** (`person.assigned_to`). Halaman **Monitoring Sales** (manajer-only) merangkum ini.

## 6. Marketplace data (hanya mode SaaS)
- Tenant boleh **publish** kontak (orang & perusahaan) ke **shared pool** platform.
- Tenant lain **browse + beli** untuk dipakai sales-nya.
- **Gate mode deploy** (superadmin): **SaaS** → menu aktif · **on-prem** → di-disable (single-tenant).
- ⚠️ **Consent/UU PDP**: jual-beli **data orang** wajib **dasar hukum/consent** (lihat §7). Data **perusahaan** (publik) jauh lebih aman. Default semua privat; hanya yang sengaja di-publish + lolos consent yang masuk pasar.

## 7. Catatan hukum (WAJIB diperhatikan)
Menjual data pribadi (nama/email/HP individu) antar-perusahaan tanpa dasar hukum = **risiko pelanggaran UU PDP** (dan GDPR bila ada data UE). Mitigasi: (a) marketplace **orang** hanya untuk kontak ber-consent/opt-in; (b) DSAR & opt-out dihormati lintas pool; (c) data **perusahaan/publik** boleh lebih bebas; (d) audit trail provenance tiap listing.

## 8. Status build
| Item | Status |
|---|---|
| 3 peran RBAC | ✅ ada |
| Isolasi antar-tenant | ✅ ada |
| `person.assigned_to` (kolom) | ✅ migrasi 0016 |
| Diagram arsitektur in-app | ✅ Dokumentasi |
| Isolasi antar-sales (enforce di query) | 🔜 |
| Halaman Monitoring Sales (manajer) | 🔜 |
| Assign lead → sales (UI) | 🔜 |
| Token ingest per-sales + daftar akun LinkedIn/IG | 🔜 |
| Marketplace (publish/browse/beli) + gate SaaS/on-prem | 🔜 |
| Consent-gate + DSAR lintas pool | 🔜 |

## 9. Urutan build disarankan
1. **Fondasi monitoring + isolasi**: enforce `assigned_to` di read query (member vs manajer) + halaman Monitoring + assign UI.
2. **Akun per-sales**: token ingest per-sales + halaman daftar LinkedIn/IG.
3. **Marketplace**: tabel listing + `platform_settings.deployment_mode` + halaman shared-contacts + gate + consent.
