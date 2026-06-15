# 27 — Pricing & billing (vision)

> Status: design spec. Lihat [overview](./18-saas-architecture-overview.md).

## Model tagihan: subscription + usage (hybrid)

Dua biaya bergerak yang harus ditutup: **AI tokens** (doc 24) & **email/enrichment
volume** (doc 21/23). Jadi: **plan langganan** (kursi + kuota dasar) **+ usage**
(overage AI/enrichment/email di atas kuota).

```
plan          (id, name, price_month, seats_included, quotas{ai_tokens, emails,
               enrichments, mailboxes, posture_max})
subscription  (id, tenant_id, plan_id, status, period_start, period_end, seats)
usage_counter (tenant_id, period, metric, used, limit)   -- diisi dari ai_usage/send_log
invoice       (id, tenant_id, period, line_items[], total, status)
```

## BYOK vs platform (kaitan ke hybrid keys)

- **Platform key** (doc 24 `source=platform`): token AI **masuk usage & ditagih
  markup**. Ini sumber margin.
- **BYOK** (`source=tenant`): token gak ditagih (tenant bayar provider langsung) —
  tapi tetap **di-meter** buat quota & analitik. Cocok jadi benefit tier atas.

## Quota enforcement

`usage_counter` di-update dari `ai_usage` + `send_log`. Saat dekat limit → alert;
saat lewat → **hard-stop** fitur terkait (kirim / AI call) sampai upgrade atau
periode baru. `posture_max` (doc 21) juga bisa di-gate per plan (mis. mode
`aggressive` cuma tier atas).

## Tier (saran awal, bukan final)

| Tier | Fokus | Gating khas |
|------|-------|-------------|
| Starter | Solo / coba | Kuota kecil, mode `compliant`, 1 mailbox |
| Growth | Tim kecil | Kuota sedang, multi-mailbox, BYOK opsional |
| Enterprise | Skala | Kuota besar, semua posture, isolasi lebih ketat (doc 19), SSO |

## Integrasi billing

Provider eksternal (mis. Stripe) buat langganan + metered usage; webhook update
`subscription`/`invoice`. Superadmin (doc 26) bisa override quota/harga per tenant.

## Target modules

```
lib/billing/                plan, subscription, usage rollup, quota guard
lib/db/schema.ts            +plan, subscription, usage_counter, invoice
app/(app)/settings/billing  tenant: plan, usage, invoice
app/(admin)/pricing         superadmin: kelola plan & override (doc 26)
```
