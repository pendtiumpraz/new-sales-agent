# 26 — Superadmin & observability (vision)

> Status: design spec. Lihat [overview](./18-saas-architecture-overview.md).

## Superadmin plane

Area terpisah (`/admin`, di luar shell tenant) buat operator platform — yang kamu
minta: "cek semua log dan infrastructure, AI, pricing, token & cost". Akses lewat
role DB yang **bypass RLS** (doc 19), digerbang ketat + di-`audit_log`.

## Yang dilihat superadmin

| Panel | Isi |
|-------|-----|
| Tenants | Daftar tenant, plan, status, usage; suspend/aktifkan; impersonate (ter-audit) |
| AI cost & tokens | `ai_usage` agregat per tenant/model/feature; tren biaya; top spender; alert |
| Pricing & plan | Kelola plan, quota, harga (doc 27); override per tenant |
| Logs | `audit_log` lintas tenant; crawl/ingest log; send log; error |
| Infra health | Status DB/queue/worker/MCP/ESP; latensi; depth antrian; rate provider |
| AI registry | Provider/model/harga (doc 24); aktif/non-aktifkan model platform-wide |
| Kill-switch | Stop crawl/kirim/AI per tenant atau global (incident response) |

## Observability (semua layer)

- **Structured logging** + correlation id (request → job → AI call).
- **Metrik:** AI cost/latency/error per model; crawl success/block rate; email
  deliverability (sent/bounce/complaint); queue depth & job latency.
- **Audit:** aksi sensitif (doc 25) immutable, append-only.
- **Alert:** over-quota AI, spike bounce/complaint, queue backlog, akun RPA kena
  rate-limit/ban (sinyal dari extension, doc 21).

Skema observability (di atas `audit_log`, `ai_usage`):
```
crawl_job (id, tenant_id, source, status, items, blocked, started_at, finished_at)
ingest_batch (id, tenant_id, origin ENUM(mcp|extension), count, dedup_hits, at)
send_log (id, tenant_id, sending_account_id, status, bounce_type?, at)
```

## Target modules

```
app/(admin)/               area superadmin (layout terpisah)
lib/db/admin.ts            koneksi role bypass-RLS (digerbang)
lib/obs/                   logger + metrik + correlation id
lib/admin/killswitch.ts    flag stop per tenant/global (dicek crawl/send/AI)
```
