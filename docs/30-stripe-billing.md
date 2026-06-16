# Doc 30 — Stripe billing scaffold

Status: **scaffold terpasang, inert sampai key diisi.** Tanpa `STRIPE_SECRET_KEY`
semua helper lapor "not configured" dan app tetap jalan pakai data billing demo.
Isi key → tombol upgrade & portal muncul otomatis, **tanpa ubah kode**.

## Arsitektur

Hosted Checkout + Customer Portal + webhook sync. Alur:

1. User (role `tenant_owner`/superadmin) klik **"Pilih <paket>"** di
   `/settings/billing` → `POST /api/billing/checkout { planKey }`.
2. Route bikin **Stripe Checkout Session** (mode `subscription`), nempel
   `tenantId` di `client_reference_id` + `metadata` (session & subscription),
   balikin `url` → browser redirect ke halaman Stripe.
3. Setelah bayar, Stripe kirim event ke `POST /api/billing/webhook` (raw body,
   signature-verified) → update tabel `subscription` (planId, status,
   `stripe_customer_id`, `stripe_subscription_id`).
4. **"Buka portal billing"** → `POST /api/billing/portal` → Stripe billing portal
   (kelola/cancel/invoice).

Quota tetap di-enforce lewat metering (token AI) + send worker; Stripe cuma
ngurus pembayaran & status langganan.

## File

| File | Isi |
|------|-----|
| `lib/billing/stripe.ts` | Client null-safe (`getStripe()`), `priceIdForPlan`, `planKeyForPrice`, `configuredPlanKeys`, `mapStripeStatus`, `appBaseUrl` |
| `app/api/billing/checkout/route.ts` | Bikin Checkout Session (guard `tenant.billing`) |
| `app/api/billing/webhook/route.ts` | Verifikasi signature + sync `subscription` (public, raw body) |
| `app/api/billing/portal/route.ts` | Buka billing portal (guard `tenant.billing`) |
| `app/api/tenant/billing/route.ts` | GET diperluas: katalog plan + flag Stripe untuk UI |
| `app/(app)/settings/billing/page.tsx` | Tombol upgrade per-plan + portal (atau hint setup) |
| Migrasi `0007` | Kolom `subscription.stripe_customer_id` + `stripe_subscription_id` |

## Cara mengaktifkan (tinggal isi key)

1. **Stripe dashboard** → Products: bikin 1 produk + recurring Price per paket
   (starter/growth/enterprise). Catat Price id (`price_...`).
2. Isi `.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...        # dari langkah 4
   STRIPE_PRICE_STARTER=price_...
   STRIPE_PRICE_GROWTH=price_...
   STRIPE_PRICE_ENTERPRISE=price_...
   APP_BASE_URL=http://localhost:3000      # atau domain produksi
   ```
3. Restart dev server (env dibaca saat boot).
4. **Webhook lokal:** `stripe listen --forward-to localhost:3000/api/billing/webhook`
   → copy `whsec_...` ke `STRIPE_WEBHOOK_SECRET`.
   **Produksi:** Stripe dashboard → Webhooks → endpoint
   `https://<domain>/api/billing/webhook`, events: `checkout.session.completed`,
   `customer.subscription.created|updated|deleted`.
5. Buka `/settings/billing` sebagai `tenant_owner` → tombol "Pilih <paket>" muncul.

## Catatan

- **Plan key → Price id** via env (bukan kolom DB) supaya konfigurasi minimal.
  Plan key (`starter|growth|enterprise`) = `plan.key` di tabel `plan`.
- Webhook pakai ctx `superadmin` saat nulis `subscription` biar lolos RLS
  begitu RLS di-enforce (lihat doc 19 / `drizzle/rls/`).
- Mapping status: `active|trialing→active`, `past_due|unpaid→past_due`, sisanya
  `→canceled`.
- Semua endpoint balikin 503 yang jelas kalau Stripe belum dikonfigurasi —
  nggak pernah throw.
