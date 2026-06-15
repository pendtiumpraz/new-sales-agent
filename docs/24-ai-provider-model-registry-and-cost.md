# 24 — AI provider/model registry & cost (vision)

> Status: design spec. Lihat [overview](./18-saas-architecture-overview.md).

## Prinsip: registry data-driven, bukan hardcoded

Model & provider didefinisikan di **DB/config**, bukan di kode. "Model terbaru
2026" masuk lewat superadmin **tanpa deploy**. `lib/ai/provider.ts` (DeepSeek
sekarang) di-generalize jadi registry + adapter per provider — Vercel AI SDK
(udah kepasang) udah punya adapter OpenAI/Anthropic/Google/DeepSeek/dll.

> ⚠️ ID model spesifik (mis. `deepseek-v4-flash` atau apa pun yang terbaru saat
> kamu baca ini) **harus diisi dari dokumentasi resmi provider saat itu** —
> jangan hardcode dari ingatan. Buat provider Anthropic, ambil ID + harga dari
> referensi resmi (`/claude-api`) — per env ini keluarga terbaru a.l. Opus 4.8 /
> Sonnet 4.6 / Haiku 4.5 / Fable 5, tapi tetap verifikasi saat seed.

## Skema

```
ai_provider (id, key ENUM(deepseek|anthropic|openai|google|…), display_name,
  base_url?, status)
ai_model    (id, provider_id, model_id, display_name, context_window,
  price_in_per_1m, price_out_per_1m, capabilities[], is_active, scope)
ai_credential (id, tenant_id?, provider_id, api_key_enc, label, source ENUM(platform|tenant))
ai_usage    (id, tenant_id, user_id?, model_id, feature, tokens_in, tokens_out,
  cost, latency_ms, at)
```

## Keputusan terkunci

- **Hybrid keys:** `ai_credential.source = platform` (default, di-meter & ditagih
  markup) **atau** `tenant` (BYOK — tenant masukin kunci sendiri, di-encrypt sama
  mekanisme mailbox doc 23). Resolusi: kunci tenant kalau ada, kalau nggak pakai
  platform.
- **1 model aktif per-tenant:** `ai_model.is_active` discope per tenant (tabel
  pivot `tenant_active_model (tenant_id, model_id)`). Tepat satu aktif → ditegakkan
  unique constraint. Superadmin nentuin model mana yang *tersedia*; tenant pilih 1
  dari yang tersedia + plannya.

## Cost & token metering

Tiap panggilan AI nyatet `ai_usage` (token in/out, cost dihitung dari harga
model, latency, feature). Dari situ: **budget/quota per tenant**, alert,
hard-stop saat over-quota, dan dashboard cost superadmin (doc [26]) + tagihan
(doc [27]). Cost dihitung saat catat (snapshot harga) biar tahan perubahan harga.

## Adapter

```
lib/ai/registry.ts          resolve provider+model+credential aktif per tenant
lib/ai/adapters/*           bungkus Vercel AI SDK per provider (uniform interface)
lib/ai/meter.ts             wrap call → catat ai_usage, enforce quota
```

`generateText` / `streamText` selalu lewat `meter` → gak ada panggilan AI yang
lolos tanpa tercatat & ter-quota.

## Relasi existing

`lib/ai/provider.ts` (`hasDeepseekKey`, model `deepseek-chat`/`reasoner`) jadi
adapter pertama. `NEXT_PUBLIC_AI_PROVIDER=mock` tetap jadi fallback offline
(doc — `lib/api-mock/kb.ts`) buat dev/demo tanpa biaya.

## Target modules

```
lib/ai/registry.ts, adapters/, meter.ts
lib/db/schema.ts            +ai_provider, ai_model, ai_credential, ai_usage, tenant_active_model
app/(app)/settings/ai       tenant: pilih model aktif + BYOK key
app/(admin)/ai              superadmin: kelola provider/model/harga
```
