# Doc 31 — Inngest background queue scaffold

Status: **scaffold terpasang.** Dev lokal jalan tanpa key (mode dev); produksi
isi `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY`. Ini menggantikan model
"proses inline / on-demand" jadi terjadwal otomatis — **tanpa ubah engine**:
function-nya manggil `processCadences` / `processSendJobs` yang sama persis
dengan route `/api/cadences/process` dan `/api/tenant/sends`.

## Functions (`lib/inngest/functions.ts`)

| Function | Trigger | Kerja |
|----------|---------|-------|
| `cadence-cron` | cron `*/15 * * * *` | Tiap tenant aktif → `processCadences` (majukan step cadence jatuh tempo) |
| `send-queue-cron` | cron `*/5 * * * *` | Tiap tenant aktif → `processSendJobs` (drain antrian email) |
| `cadence-on-demand` | event `cadence/process.requested` | Proses 1 tenant; trigger `inngest.send({ name, data: { tenantId } })` (mis. habis bulk-enroll) |

Tiap function enumerasi tenant via `tenants` (status `active`), lalu jalanin
engine per-tenant pakai ctx system `superadmin` (lolos RLS, write tetap
ter-scope ke `tenant_id`). Engine tetap cek `isTenantActive` sendiri.

## File

| File | Isi |
|------|-----|
| `lib/inngest/client.ts` | Client `inngest` (auto dev/cloud via `isDev`) |
| `lib/inngest/functions.ts` | 3 function di atas + `functions[]` |
| `app/api/inngest/route.ts` | `serve()` — GET introspeksi, PUT register, POST invoke |

## Cara mengaktifkan

### Lokal (dev — tanpa key)
1. Dev server jalan (`npm run dev`). `GET /api/inngest` balikin introspeksi
   (`mode: dev`, `function_count: 3`).
2. Jalanin Inngest dev server: `npx inngest-cli@latest dev` → buka dashboard
   `http://localhost:8288`, auto-discover app di `http://localhost:3000/api/inngest`.
   Cron & event langsung kelihatan + bisa di-trigger manual dari dashboard.

### Produksi (isi key)
1. Daftar di [inngest.com](https://www.inngest.com), bikin app, ambil
   **Event Key** + **Signing Key**.
2. Isi env (Vercel / `.env.local`):
   ```
   INNGEST_EVENT_KEY=...
   INNGEST_SIGNING_KEY=signkey-prod-...
   ```
   (Jangan set `INNGEST_DEV` di produksi — biar mode cloud aktif.)
3. Deploy. Inngest dashboard → Sync app ke `https://<domain>/api/inngest`.
   Cron mulai jalan otomatis sesuai jadwal.

## Catatan

- Tanpa Inngest tersambung, engine **tetap bisa dipanggil manual** lewat tombol
  "Jalankan sekarang" (cadence) + `/api/tenant/sends` — jadi nggak ada yang
  rusak; Inngest cuma nambah penjadwalan otomatis.
- `isDev` di client: default `NODE_ENV !== "production"`. `INNGEST_DEV=1`
  override-nya. Ini yang bikin `/api/inngest` nggak 500 di lokal saat belum ada
  signing key.
- Step pakai `step.run(id, fn)` supaya tiap tenant ter-checkpoint sendiri (retry
  per-tenant, bukan ulang semua).
