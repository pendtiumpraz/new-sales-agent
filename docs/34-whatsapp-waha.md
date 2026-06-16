# Doc 34 — WhatsApp via WAHA

Status: **scaffold terpasang, inert sampai key diisi.** Channel non-email pertama
yang punya transport live: step cadence `whatsapp` (sebelumnya cuma di-queue)
sekarang **kirim beneran** lewat **WAHA** (WhatsApp HTTP API self-hosted,
github.com/devlikeapro/waha). Tanpa `WAHA_BASE_URL` + `WAHA_API_KEY`, step WA
tetap di-queue & tombol/test disembunyikan.

## Cara kerja

- `lib/wa/waha.ts` — client null-safe: `sendWhatsApp({to,text})` (POST
  `/api/sendText`), `wahaStatus()` (cek sesi), `toChatId()` (normalisasi nomor:
  `08xx`/`62xx` → `<digits>@c.us`).
- **Cadence**: di `processCadences`, step channel `whatsapp` + WAHA aktif +
  kontak punya `phone` → `sendWhatsApp(text=body)` (body sudah dipersonalisasi
  AI/template), `cadence_step_run.status=sent` (`summary.waSent++`). Tanpa nomor
  → `skipped`; WAHA off → `queued` (seperti sebelumnya).
- **Manual/test**: `POST /api/wa/send {to,text}` + kartu "WhatsApp (WAHA)" di
  `/settings/mailboxes` (status sesi + form kirim). `GET /api/wa/status` buat
  health.

## File

| File | Isi |
|------|-----|
| `lib/wa/waha.ts` | Client WAHA (send, status, chatId), null-safe |
| `lib/cadence/processor.ts` | Branch `whatsapp` → kirim live + `waSent` di summary |
| `app/api/wa/status` · `app/api/wa/send` | Health + manual send (guard `campaign.manage`) |
| `app/(app)/settings/mailboxes/page.tsx` | Kartu WhatsApp (status + test send) |
| `app/(app)/cadences/page.tsx` | Toast "Jalankan sekarang" + hitungan WA terkirim |

Tidak ada migrasi — `cadence_step_run` cukup; nomor diambil dari `contacts.phone`.

## Cara mengaktifkan (tinggal isi key)

1. Jalankan WAHA (Docker):
   ```
   docker run -it -p 3000:3000/tcp \
     -e WAHA_API_KEY=rahasia123 devlikeapro/waha
   ```
   (atau pakai instance WAHA yang sudah ada.)
2. `.env.local` (key-nya sudah ada, tinggal isi):
   ```
   WAHA_BASE_URL=http://localhost:3000   # URL server WAHA
   WAHA_API_KEY=rahasia123
   WAHA_SESSION=default
   ```
   ⚠️ Kalau WAHA jalan di port 3000, pindahkan app Next ke port lain (`next dev -p 3001`)
   biar nggak bentrok, dan set `WAHA_BASE_URL` ke port WAHA.
3. Restart dev server. Buka `/settings/mailboxes` → kartu WhatsApp: scan QR di
   WAHA dulu (status `SCAN_QR_CODE` → `WORKING`), lalu test kirim.
4. Cadence step `whatsapp` otomatis kirim via sesi ini saat diproses.

## Catatan

- **Nomor** diambil dari `contacts.phone`; normalisasi `08` → `62`. Pastikan
  kontak punya nomor valid (kalau tidak → step `skipped`).
- **Compliance**: WA nggak nambah footer unsubscribe (itu khusus email). Konsen
  channel WA harus dijaga di sisi data (consent_status) — belum di-enforce ke WA.
- **Bukan WhatsApp Business API resmi** — WAHA otomasi WhatsApp Web; tunduk ToS
  WhatsApp & risiko ban kalau spam. Pakai bertanggung jawab (rate-limit, opt-in).
- Ganti ke WhatsApp Cloud API resmi = ganti isi `lib/wa/waha.ts`; pemanggil
  (processor) nggak berubah.
