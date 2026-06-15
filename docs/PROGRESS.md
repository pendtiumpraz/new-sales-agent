# Progress Report — SaaS Sales Intelligence Platform

Laporan progres hidup. Di-update tiap ada kemajuan. Rencana penuh di
[`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md); visi di `docs/18`–`27`.

**Legenda:** ✅ selesai · 🟡 jalan · ⬜ belum · ⛔ keblok

_Terakhir diperbarui: 2026-06-15_

## Ringkasan

| Fase | Judul | Status |
|------|-------|--------|
| 0 | Persiapan & docs | 🟡 |
| 1 | Fondasi tenant (RLS + RBAC + auth) | ⬜ |
| 2 | Data model Company/Person/ContactPoint | ⬜ |
| 3 | AI registry + metering | ⬜ |
| 4 | Acquisition MVP + positioning | ⬜ |
| 5 | Engagement: mailbox + send worker + cadence | ⬜ |
| 6 | Chrome extension RPA | ⬜ |
| 7 | Compliance hardening | ⬜ |
| 8 | Superadmin + observability + billing | ⬜ |

## Detail terbaru

### Fase 0 — Persiapan & docs 🟡
- ✅ Setup Claude Code: `CLAUDE.md`, `CLAUDE.local.md`, skill `/ship` & `/db-refresh`, hook eslint-fix
- ✅ Branch `new-main` dibuat
- ✅ `npm install` (715 packages) + dev server jalan (`http://localhost:3001`)
- ✅ Design docs `18`–`27` ditulis
- ✅ `IMPLEMENTATION-PLAN.md` + `PROGRESS.md` ditulis
- ⬜ Spike keputusan: auth provider (Auth.js vs Clerk/WorkOS) & queue (tabel vs Inngest/Trigger.dev)

### Fase 1–8
Belum mulai — lihat rencana per fase di `IMPLEMENTATION-PLAN.md`.

## Keputusan arsitektur (terkunci)
- Isolasi tenant: shared DB + Postgres RLS (`tenant_id`)
- RBAC: `superadmin` → `tenant_owner` → `tenant_admin` → `member`
- Email sending: dukung semua (OAuth Gmail/MS + SMTP + platform ESP)
- AI keys: hybrid (platform default + tenant BYOK)
- Active model: per-tenant (1 aktif)
- Crawling: posture dipilih user (compliant ↔ aggressive) + Chrome extension RPA
- Discovery: AI nentuin target market (B2B/B2C) + ICP dari product; entry point URL/bidang/bulk-list/auto + cascade ke company & orang terkait; semua hasil disimpan DB

## Keputusan terbuka (perlu diputuskan)
- ⬜ Auth provider final
- ⬜ Queue/worker final
- ⬜ Billing provider (asumsi Stripe)
- ⬜ ID model AI + harga aktual (isi saat seed Fase 3, dari docs resmi provider)

## Cara update dokumen ini
Saat satu item kelar: ubah status (⬜→🟡→✅), update tanggal, dan kalau satu fase
beres penuh ganti statusnya di tabel Ringkasan. Catat keputusan baru di bagian
"Keputusan arsitektur".
