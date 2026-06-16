# Doc 35 — Autonomous engagement loop: upsell + close (Stripe)

Status: **terpasang & terverifikasi** (engine end-to-end di DB live). Ini bikin
sistem nggak cuma follow-up — tapi **upsell otomatis + closing** lewat link
pembayaran Stripe, bisa jalan 24 jam via Inngest cron.

## Cara kerja

`runUpsell(ctx)` (lib/engagement/upsell.ts):

1. Ambil **KB terkaya** untuk tenant + semua deal stage `tutup` (closed-won).
2. Pilih produk upsell dari `kb.upsellMap` (produk rekomendasi berikutnya) +
   harganya dari `kb.pricing`.
3. Per customer: cek **idempotency** (skip kalau sudah di-upsell produk yang sama
   dalam 30 hari) → buat **link checkout Stripe** (one-time, amount IDR ad-hoc;
   null kalau Stripe off) → **draft pesan upsell** (metered AI, grounded ke
   rationale + harga; fallback template) → append link → **kirim** via channel:
   email → `send_job` (`feature=upsell`), atau WhatsApp → WAHA.
4. Catat tiap aksi di `engagement_event` (idempotency + reporting).

**Closing primitive** = `createCheckoutLink()` (lib/billing/checkout-link.ts):
Stripe Checkout `mode=payment`, `price_data` inline (IDR zero-decimal), metadata
tenant+contact. Ini "tombol bayar" yang ditempel ke pesan.

## Pemicu (24 jam)

- **Inngest `upsell-cron`** (harian 09:00 UTC) → `runUpsell` per tenant aktif.
  Begitu `INNGEST_*` diisi, jalan otomatis tiap hari.
- **Manual**: tombol **"Jalankan upsell"** di halaman Cadence, atau
  `POST /api/engagement/upsell`.
- **Manual close link**: `POST /api/billing/payment-link {productName, amountIdr}`.

## File

| File | Isi |
|------|-----|
| `lib/billing/checkout-link.ts` | `createCheckoutLink` (Stripe one-time, IDR) |
| `lib/engagement/upsell.ts` | `runUpsell`, `recentEngagementEvents`, pilih upsell dari KB |
| `app/api/engagement/upsell` | GET log + POST run (guard `campaign.manage`) |
| `app/api/billing/payment-link` | Close link manual (guard `tenant.billing`) |
| `lib/inngest/functions.ts` | `upsell-cron` harian |
| `app/(app)/cadences/page.tsx` | Tombol "Jalankan upsell" |
| Tabel `engagement_event` (migrasi 0008) | Log + idempotency (dedup per contact+product) |

## Verifikasi (DB live)

Dengan KB sementara (rule p_inti→p_pro @Rp750k) + 1 deal `tutup`:
`runUpsell` → `candidates:1, sent:1`, event `kind=upsell channel=email
status=queued`, pesan AI grounded ("…Maira Pro… mulai Rp 750.000…"); re-run →
`dedup:1`. Stripe off → pesan tanpa link; Stripe on → link checkout di-append.

## Catatan & rambu

- **KB harus ada di DB.** Demo KB hidup di mock JSON; kalau `kb` kosong di DB,
  upsell `candidates:0` (engine aman, nggak crash). Seed KB ke DB dulu (atau via
  editor KB) biar ada kandidat.
- **Heuristik kandidat**: deal stage `tutup` → tawarkan produk upsell teratas.
  Deal belum nyimpan `productId`, jadi targetnya upsell pertama yang valid. Buat
  presisi: tambah `productId` di deal lalu cocokkan `fromProductId`.
- **Closing penuh otomatis** cocok untuk low-ticket/transaksional. High-ticket →
  human-in-the-loop (AI drive ke link, manusia tutup). Belum ada gate
  confidence/escalation untuk auto-reply — itu potongan berikutnya.
- **Compliance**: hormati consent/opt-out; WA via WAHA ada risiko ban (rate-limit,
  opt-in). Link Stripe IDR = one-time payment; langganan butuh Price recurring.
- **Recurring billing** (bulanan/tahunan) saat ini dikirim sebagai one-time
  checkout. Untuk subscription beneran, pakai Price recurring (lihat doc 30).
