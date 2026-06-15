# 23 — Outreach, email identity & deliverability (vision)

> Status: design spec. Jawaban pertanyaan "user input mail masing-masing, bukan
> dari env". Lihat [overview](./18-saas-architecture-overview.md).

## Identitas pengirim per-user (bukan 1 mailbox dari env)

`env` cuma buat secret platform. Email user dikirim dari **mailbox yang
di-connect tiap user** → entity `sending_account` (mailbox) per user per tenant.
Satu user boleh punya >1 mailbox (rotasi/warmup).

```
sending_account (id, tenant_id, user_id, type ENUM(gmail_oauth|ms_oauth|smtp|platform_esp),
  from_email, from_name, status,
  oauth_tokens_enc?,         -- access/refresh terenkripsi (OAuth)
  smtp_config_enc?,          -- host/port/user/pass terenkripsi (SMTP)
  esp_domain?,               -- domain platform-managed (ESP)
  daily_limit, sent_today, warmup_stage, reputation_score)
```

### Tiga jalur connect (dukung semua)
| Type | Cara | Catatan |
|------|------|---------|
| `gmail_oauth` / `ms_oauth` | OAuth → kirim via **Gmail API / MS Graph** | Reply masuk inbox asli, deliverability terbaik, tanpa password |
| `smtp` | User input host/port/user/app-password | Universal (domain custom), kredensial **di-encrypt** |
| `platform_esp` | Platform provision sub-domain (SES/Postmark) + DKIM/SPF | Buat warmup & volume; "bukan inbox-ku" |

## Keamanan kredensial

- **Encrypt at rest** (KMS / libsodium), **kunci per-tenant**. Bukan plaintext,
  bukan `env`. Master key di secret manager.
- OAuth: simpan refresh token, handle expiry/refresh, revoke saat disconnect.
- Akses mailbox tunduk RLS — user cuma lihat mailbox-nya (admin lihat se-tenant).

## Pipeline kirim = background job

Vercel serverless ada timeout → **jangan kirim inline di request**. Pola:

```
compose (template + AI personalize, doc 22) → preview → enqueue
   → send_job (queue: tabel + worker | Inngest | Trigger.dev)
   → worker pilih mailbox, cek limit/suppression, kirim via adapter
   → catat status, handle bounce/complaint (webhook)
```

Adapter kirim: `nodemailer` (SMTP), `googleapis` (Gmail), `microsoft-graph`
(MS Graph), SDK ESP (SES/Postmark).

## Template + custom email

```
email_template (id, tenant_id, name, subject, body, merge_tags[], channel)
```
Merge tags (`{{first_name}}`, `{{company}}`, `{{product_angle}}`) + bagian
**AI-personalized** dari `positioning_insight.draft_opener` (doc [22]). User bisa
pilih template **atau** tulis custom; selalu lewat **preview** sebelum queue.

## Deliverability (wajib, kalau nggak "blasting" = masuk spam)

- **SPF / DKIM / DMARC** di domain pengirim (wizard verifikasi DNS saat connect).
- **Warmup** mailbox baru; **daily limit** & ramp per mailbox; rotasi.
- **Bounce/complaint webhook** → auto-suppress, turunin reputation.
- **Rate-limit + jitter** per mailbox (mirip guardrail RPA, doc 21).

## Compliance (doc [25], non-opsional)

Tiap email outbound: **link unsubscribe**, hormati **suppression list** (opt-out
gak boleh dikirim lagi), footer legal pengirim. Status consent contact (doc 20)
nentuin boleh-tidaknya dikontak.

## Multi-channel & relasi existing

Reuse `/cadences` (doc 12) → step bisa email / WA / LinkedIn DM. `auto-reply` &
`draft-message` jadi konsumen AI registry + positioning. WA/sosmed punya aturan
platform sendiri (WA Business API butuh opt-in template) — modelkan tiap channel
punya policy & limit sendiri.

## Target modules

```
lib/db/schema.ts            +sending_account, email_template, send_job, suppression
lib/mail/connect/           OAuth flow Gmail/MS + SMTP wizard + ESP provision
lib/mail/send/              adapter (nodemailer/gmail/graph/esp) + worker
lib/mail/deliverability/    warmup, limit, bounce/complaint webhook
app/(app)/settings/mailboxes connect & kelola mailbox
app/(app)/cadences/         step multi-channel + pilih mailbox pengirim
```
