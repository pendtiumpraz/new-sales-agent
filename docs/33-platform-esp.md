# Doc 33 — Platform ESP (Resend) + bounce webhook

Status: **scaffold terpasang, inert sampai key diisi.** Transport pengiriman
ketiga (selain SMTP app-password & OAuth XOAUTH2): kirim lewat **ESP platform
(Resend)** buat tenant yang nggak mau connect mailbox sendiri. Plus webhook
bounce/complaint → suppression. Tanpa `RESEND_API_KEY` semuanya inert.

## Transport pengiriman (3 jalur, satu worker)

`processSendJobs` (lib/mail/send.ts) pilih jalur per `sending_account.type`:

| type | jalur |
|------|-------|
| `smtp` | SMTP app-password (nodemailer) |
| `gmail_oauth` / `ms_oauth` | SMTP XOAUTH2 (doc 32) |
| `platform_esp` | **Resend API** (key platform, tanpa config per-akun) |

Suppression, daily-cap, footer unsubscribe, kill-switch tetap di-enforce sama
buat ketiganya.

## File

| File | Isi |
|------|-----|
| `lib/mail/esp.ts` | `espConfigured()`, `sendViaEsp()` (Resend, tag `tenant_id`) |
| `lib/mail/send.ts` | Worker bercabang: `platform_esp` → `sendViaEsp`, lainnya → `sendViaSmtp` |
| `app/api/tenant/mailboxes/esp` | Connect identitas platform-ESP (guard `mailbox.connect`) |
| `app/api/esp/webhook` | Bounce/complaint → suppression (public, Svix-signed) |
| `app/api/tenant/mailboxes` GET | + flag `oauth.esp` |
| `app/(app)/settings/mailboxes/page.tsx` | Tombol "Pakai email platform (ESP)" |

Tidak ada migrasi — `sending_account.type = platform_esp`, `config_enc` null.

## Cara mengaktifkan (tinggal isi key)

1. Daftar [resend.com](https://resend.com), verifikasi domain pengirim (DNS
   SPF/DKIM yang Resend kasih).
2. `.env.local`:
   ```
   RESEND_API_KEY=re_...
   RESEND_WEBHOOK_SECRET=whsec_...   # dari langkah 4 (opsional tapi disarankan)
   APP_BASE_URL=...                  # buat footer unsubscribe
   ```
3. Restart dev server. Di `/settings/mailboxes`: isi From email (harus di domain
   terverifikasi) → klik **"Pakai email platform (ESP)"**.
4. **Webhook bounce:** Resend dashboard → Webhooks → endpoint
   `<APP_BASE_URL>/api/esp/webhook`, events `email.bounced` + `email.complained`.
   Copy signing secret ke `RESEND_WEBHOOK_SECRET`.

## Catatan

- **From wajib di domain terverifikasi Resend** — kalau tidak, Resend nolak
  (worker tandai job `failed` dengan pesan dari Resend).
- **Mapping bounce → tenant** best-effort lewat tag `tenant_id` yang ditempel
  saat kirim. Kalau event nggak bawa tag, webhook skip (nggak suppress global).
  Mau lebih kuat: simpan `email_id` Resend di `send_job` lalu lookup tenant dari
  situ (belum di-scaffold, butuh kolom + migrasi).
- **Signature**: kalau `RESEND_WEBHOOK_SECRET` diisi, webhook verifikasi Svix
  (svix-id/timestamp/signature); kalau kosong, diterima (dev).
- Ganti provider (SendGrid/SES) = ganti isi `lib/mail/esp.ts` doang; pemanggil
  (worker) nggak berubah.
