# Implementation Plan — SaaS Sales Intelligence Platform

Rencana eksekusi buat mewujudkan visi di `docs/18`–`27`. Berfase, tiap fase punya
**deliverable**, **dependency**, dan **acceptance** (kapan dianggap selesai).
Progres aktual dilacak di [`PROGRESS.md`](./PROGRESS.md).

**Prinsip urutan:** fondasi tenant dulu (tanpa ini semua data bocor antar-tenant),
baru data model, baru AI/akuisisi/engagement, baru hardening. Tiap fase harus
shippable & demoable di atas prototype existing.

> Konvensi: kerjakan di branch `new-main`, push ke `new-main` (lihat `CLAUDE.md`).
> Tiap fitur = satu commit + explainer doc (konvensi `docs/` existing).

---

## Fase 0 — Persiapan ✅

- [x] `CLAUDE.md` + `CLAUDE.local.md` + skill `/ship`, `/db-refresh` + hook eslint
- [x] Design docs `18`–`28`, `IMPLEMENTATION-PLAN`, `PROGRESS`
- [x] `npm install` & dev server jalan (`http://localhost:3001`)
- [x] Spike **terkunci**: Auth.js v5 + Drizzle (auth) & Inngest (queue) — decision record [doc 28](./28-decisions-auth-and-queue.md)

**Acceptance:** ✅ keputusan auth + queue terdokumentasi; repo siap dibangun di atasnya.

---

## Fase 1 — Fondasi tenant (RLS + RBAC + auth)  · doc 19

- [ ] Schema: `tenant`, `user`, `membership`, `invite`, `audit_log`; tambah `tenant_id` ke tabel existing
- [ ] Postgres RLS + wrapper koneksi (`SET LOCAL app.tenant_id/user_id/role`)
- [ ] Auth.js v5 + Drizzle adapter (doc 28) gantiin mock login → session isi `{tenant_id, user_id, role}`
- [ ] RBAC guard (route + UI), matrix 4 role
- [ ] UI kelola member + invite (extend settings)

**Dependency:** Fase 0. **Acceptance:** dua tenant uji tak bisa saling lihat data
(uji RLS); invite→join→role bekerja; route ter-guard.

---

## Fase 2 — Data model Company/Person/ContactPoint  · doc 20

- [ ] Schema: `company`, `person`, `contact_point`, `product`
- [ ] Identity resolution / dedup (`lib/profiling/dedup.ts`)
- [ ] Migrasi `ProspectLead` → view (person ⨝ company)
- [ ] UI contacts tab "Perusahaan" vs "Orang"

**Dependency:** Fase 1. **Acceptance:** import sampel → ter-dedup, company vs human
terpisah, provenance/consent tersimpan per contact point.

---

## Fase 3 — AI registry + metering  · doc 24

- [ ] Schema: `ai_provider`, `ai_model`, `ai_credential`, `ai_usage`, `tenant_active_model`
- [ ] Generalize `lib/ai/provider.ts` → `registry` + adapters (Vercel AI SDK)
- [ ] `meter` wrapper (catat usage + enforce quota) — semua AI call lewat sini
- [ ] Hybrid keys (platform default + tenant BYOK, terenkripsi)
- [ ] Per-tenant 1 model aktif (unique constraint) + UI pilih model
- [ ] Seed provider/model + harga **dari docs resmi** (verifikasi ID; Anthropic via `/claude-api`)

**Dependency:** Fase 1. **Acceptance:** ganti model aktif per tenant tanpa deploy;
tiap call tercatat di `ai_usage` dengan cost; quota hard-stop bekerja.

---

## Fase 4 — Acquisition MVP + positioning  · doc 21, 22

- [ ] MCP server: `crawl_company`, `find_company_contacts`, `find_people`, `enrich_person`, `verify_email`
- [ ] `/api/ingest` (zod, idempotent) → dedup → enrichment
- [ ] Posture mode per-tenant (`compliant`/`balanced`/`aggressive`) + guardrail
- [ ] AI target-market/ICP derivation dari product (doc 22 Tahap 0)
- [ ] Discovery entry points: URL manual, pilih industri (ICP-filtered), bulk company-name list (antri 1/1), auto
- [ ] Discovery cascade: contact kosong → crawl company & orang terkait
- [ ] Engine `positioning_insight` (company × product → angle, fit_score, opener) + grounding
- [ ] `ProspectSheet` pakai insight tersimpan

**Dependency:** Fase 2, 3. **Acceptance:** crawl domain uji → company+contacts
ter-provenance; bulk list di-crawl satu-satu & tersimpan; cascade nemu orang
terkait saat contact kosong; insight ter-grounding ke sumber; fit_score tampil.

---

## Fase 5 — Engagement: mailbox + send worker + cadence  · doc 23

- [ ] Schema: `sending_account`, `email_template`, `send_job`, `suppression`
- [ ] Connect mailbox: OAuth Gmail/MS + SMTP wizard + ESP provision (terenkripsi)
- [ ] Send worker (queue) + adapter (nodemailer/gmail/graph/esp) + preview
- [ ] Deliverability: SPF/DKIM/DMARC wizard, warmup, daily limit, bounce/complaint webhook
- [ ] Cadence multi-channel pilih mailbox + AI personalize (doc 22)

**Dependency:** Fase 4. **Acceptance:** kirim email nyata dari mailbox user (OAuth &
SMTP) lewat worker; unsubscribe→suppression dihormati; bounce auto-suppress.

---

## Fase 6 — Chrome extension RPA  · doc 21

- [ ] MV3: content (baca LinkedIn search dll) + background (rate-limit/jitter/antrian)
- [ ] Local storage buffer + sync client → `/api/ingest` (idempotent)
- [ ] Banner risiko ToS + consent (mode agresif) → `audit_log`; daily cap per akun

**Dependency:** Fase 4 (ingest). **Acceptance:** search LinkedIn → buffer lokal →
sync → muncul sebagai person/contact ter-provenance; rate cap & pause bekerja.

---

## Fase 7 — Compliance hardening · doc 25

- [ ] Suppression/consent ditegakkan di worker (bukan UI saja)
- [ ] Retensi/TTL + DSAR (export/delete per subjek lintas tabel)
- [ ] Klasifikasi & masking PII; halaman `/unsubscribe`

**Dependency:** Fase 5. **Acceptance:** DSAR hapus subjek bersih lintas tabel;
opt-out real-time; audit lengkap.

---

## Fase 8 — Superadmin + observability + billing  · doc 26, 27

- [ ] `/admin` (bypass-RLS digerbang): tenants, AI cost, logs, infra, kill-switch
- [ ] Logging terstruktur + correlation id + metrik + alert
- [ ] Billing: plan/subscription/usage rollup/quota + integrasi Stripe + invoice

**Dependency:** Fase 3, 5. **Acceptance:** superadmin lihat cost per tenant &
kill-switch jalan; quota→tagihan akurat untuk satu siklus.

---

## Risiko & catatan lintas-fase

- **Verifikasi ID model AI** dari docs resmi tiap provider (jangan dari ingatan) — Fase 3.
- **Deliverability** bisa makan waktu (warmup, DNS) — mulai eksperimen lebih awal di Fase 5.
- **Ban risk RPA**: rate-limit konservatif dari awal; treat sinyal ban sebagai alert P1.
- **RLS bug = kebocoran data** → wajib test isolasi tiap tambah tabel ber-tenant.
