# Doc 32 — Mailbox OAuth (Gmail / Microsoft 365)

Status: **scaffold terpasang, inert sampai key diisi.** User connect mailbox-nya
sendiri (Gmail / Outlook) via OAuth → send worker kirim **sebagai mereka** lewat
**SMTP XOAUTH2** (pakai pipa kirim yang sudah ada). Tanpa client id/secret,
tombol OAuth disembunyikan & SMTP app-password tetap jalan.

## Kenapa SMTP XOAUTH2 (bukan Gmail/Graph API)

Reuse `lib/mail/smtp.ts` (nodemailer) yang sudah dipakai send worker — cuma ganti
`auth` jadi `{ type: "OAuth2", user, accessToken }`. Satu jalur kirim untuk SMTP
password maupun OAuth, dua provider. Yang disimpan cuma **refresh token**
(terenkripsi di `sending_account.config_enc`); access token di-mint per kirim.

## Alur

1. User (perm `mailbox.connect`) klik **Connect Gmail/Outlook** di
   `/settings/mailboxes` → `GET /api/mailboxes/oauth/<provider>/start`.
2. Route redirect ke consent provider (state HMAC-signed buat CSRF).
3. Provider balik ke `GET /api/mailboxes/oauth/<provider>/callback?code&state` →
   verify state → tukar `code` jadi token → simpan `sending_account`
   (`type=gmail_oauth|ms_oauth`, `from_email` dari id_token, refresh token
   terenkripsi) → redirect `/settings/mailboxes?connect=success`.
4. Saat kirim: `lib/mail/smtp.ts` ambil refresh token → mint access token
   (`accessTokenFromRefresh`) → SMTP XOAUTH2.

## File

| File | Isi |
|------|-----|
| `lib/mail/oauth.ts` | Provider registry (Google/MS): authUrl, token exchange/refresh, scope, SMTP host, state sign/verify, `mailProviderConfigured` |
| `lib/mail/smtp.ts` | `MailConfig` union (SMTP password \| OAuth); `buildTransport` mint access token utk XOAUTH2 |
| `app/api/mailboxes/oauth/[provider]/start` | Redirect ke consent (guard `mailbox.connect`) |
| `app/api/mailboxes/oauth/[provider]/callback` | Tukar code + simpan mailbox |
| `app/api/tenant/mailboxes` GET | + flag `oauth.{google,microsoft}` |
| `app/(app)/settings/mailboxes/page.tsx` | Tombol Connect Gmail/Outlook + toast hasil |

Tidak ada migrasi — kolom `sending_account.type` + `config_enc` sudah cukup.

## Cara mengaktifkan (tinggal isi key)

### Google (Gmail)
1. Google Cloud Console → OAuth consent screen (External) + **OAuth Client ID**
   (Web application).
2. Authorized redirect URI: `<APP_BASE_URL>/api/mailboxes/oauth/google/callback`.
3. Scope `https://mail.google.com/` itu **restricted** → butuh verifikasi Google
   untuk produksi; untuk dev cukup tambahkan akun sebagai **test user**.
4. `.env.local`:
   ```
   GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=...
   APP_BASE_URL=http://localhost:3000
   ```

### Microsoft 365 (Outlook)
1. Azure Portal → App registrations → New. Redirect URI (Web):
   `<APP_BASE_URL>/api/mailboxes/oauth/microsoft/callback`.
2. API permissions: `SMTP.Send` (+ `offline_access`, `openid`, `email`).
   Pastikan **SMTP AUTH** enabled di tenant Exchange (kalau tidak, perlu Graph
   `Mail.Send` — lihat catatan).
3. `.env.local`:
   ```
   MICROSOFT_OAUTH_CLIENT_ID=...
   MICROSOFT_OAUTH_CLIENT_SECRET=...
   MICROSOFT_OAUTH_TENANT=common   # atau tenant id spesifik
   ```

Restart dev server (env dibaca saat boot) → tombol OAuth muncul di
`/settings/mailboxes`.

## Catatan

- **Refresh token wajib.** Google dipaksa `access_type=offline&prompt=consent`;
  kalau user sudah pernah consent dan provider nggak kasih refresh token,
  callback redirect `?connect=norefresh` (suruh connect ulang & izinkan penuh).
- **State CSRF**: HMAC(AUTH_SECRET), TTL 10 menit; callback juga butuh sesi yang
  sama (identitas tenant/user dari session, bukan dari state).
- **Kalau tenant MS matiin SMTP AUTH**: jalur SMTP XOAUTH2 gagal — alternatif
  Microsoft Graph `/me/sendMail` (`Mail.Send`) bisa ditambah sebagai transport
  kedua di `lib/mail/smtp.ts` tanpa ubah pemanggil. Belum di-scaffold.
- Kirim email nyata tetap butuh mailbox tersambung; quota/suppression/footer
  unsubscribe tetap di-enforce send worker (doc 23).
