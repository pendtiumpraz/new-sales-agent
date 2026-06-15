# 28 — Decision record: Auth & Queue (Fase 0 spike)

> Status: **terkunci 2026-06-15.** Hasil spike Fase 0
> ([IMPLEMENTATION-PLAN](./IMPLEMENTATION-PLAN.md)). Dua keputusan fondasi yang
> nyangkut hampir semua fase lain.

## Keputusan 1 — Auth: **Auth.js v5 (NextAuth) + Drizzle adapter**

Google + Microsoft OAuth + magic-link. Session ngisi `{user_id, tenant_id, role}`
→ di-inject ke RLS context tiap request (doc [19]).

**Kenapa (vs Clerk / WorkOS):**
- **RLS = source-of-truth di Postgres.** `tenant`/`membership`/`role` (doc 19)
  tinggal di DB-mu, bukan di-mirror dari pihak ketiga. Auth.js naruh user/session
  di Neon lewat Drizzle adapter → satu sumber kebenaran buat RLS.
- **Reuse OAuth.** Kamu udah butuh OAuth Google/MS buat connect mailbox (doc [23])
  — infra OAuth app yang sama dipakai ulang.
- **PDP/data-ownership** (doc [25]). PII auth gak nyangkut ke processor pihak ketiga
  di jalur kritis → cerita compliance bersih.
- **Biaya.** Gratis; relevan pre-revenue.
- **RBAC udah dibangun sendiri** (doc 19), jadi nilai jual Organizations Clerk
  sebagian redundan.

**Konsekuensi / yang berubah:**
- Schema auth (users/accounts/sessions/verification) via Drizzle adapter, **di
  samping** `tenant`/`membership`/`invite` (doc 19).
- Boilerplate auth + keamanan session jadi tanggung jawab kita.
- **SSO enterprise (SAML/SCIM) ditunda** → bolt-on (WorkOS SSO / BoxyHQ Jackson)
  pas tier Enterprise (doc [27]). Jangan bangun sekarang.

## Keputusan 2 — Queue: **Inngest** (Postgres = system-of-record)

Durable steps + flow-control (rate-limit / throttle / concurrency-key) jalan native
di Vercel serverless, tanpa host worker terpisah.

**Kenapa (vs Trigger.dev / Postgres queue):**
- **Beban kerja = durable multi-step + rate-limited + terjadwal + retry** (cadence,
  send, orkestrasi crawl) — persis use-case durable execution.
- **Vercel serverless gak punya worker always-on.** Inngest hilangin kebutuhan host
  worker → ops minimal buat solo founder.
- **Bagian tersulit = rate-limit/throttle/concurrency per-mailbox & anti-ban**
  (doc [21], [23]). Primitive flow-control Inngest (concurrency-key, throttle)
  motong langsung ke kebutuhan ini.

**Pola arsitektur (penting):**
- **Baris `crawl_job` / `send_job` tetap di Postgres sebagai system-of-record**
  (status, provenance, observability — doc [26]). Inngest cuma **ngeksekusi**
  (retry, jadwal, flow-control). DB punya datanya, Inngest punya orkestrasinya.
- **Bawa ID/reference, bukan raw PII** ke event Inngest (mitigasi PDP, doc 25).
- **Abstraksi layer dispatch** (`lib/jobs/dispatch.ts`) biar bisa di-swap kalau
  perlu.

**Kapan ganti:**
- Residency/self-host jadi syarat keras (enterprise/PDP) → **Trigger.dev**
  (self-hostable, kuat buat crawl long-running).
- Mau zero-vendor & udah jalanin host worker → **pg-boss / Graphile Worker** di Neon.

## Yang perlu diverifikasi saat implementasi

- Versi & status Auth.js v5 + Drizzle adapter per Juni 2026.
- Free-tier & limit Inngest (concurrency, step count) per Juni 2026.
- Setup OAuth app Google Cloud & Microsoft Entra (scope buat login *dan* kirim mail, doc 23).

## Target modules (turunan keputusan ini)

```
lib/auth/                   Auth.js config + Drizzle adapter + session → RLS context
lib/db/schema.ts            +tabel auth (users/accounts/sessions) di samping tenant/membership
lib/jobs/dispatch.ts        abstraksi enqueue (impl: Inngest)
lib/jobs/functions/         Inngest functions (send, crawl orchestration, cadence steps)
lib/db/schema.ts            crawl_job / send_job = system-of-record (doc 21/23/26)
```
