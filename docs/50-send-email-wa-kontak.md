# 50 — Kirim Email / WhatsApp ke kontak terpilih

Fitur "blast" dari halaman **Kontak**: pilih kontak (checkbox) → tombol **Kirim Email/WA** di bulk action bar → dialog dengan dua jalur pengiriman. Tujuannya satu: user bisa langsung menjangkau kontak yang dipilih tanpa keluar dari app, dengan atau tanpa setup server.

## Dua jalur pengiriman (sesuai permintaan: extension + manual + gateway + mailbox)

1. **Kirim otomatis (server)** — lewat platform.
   - **Email** → antri via `enqueueSend()` ke `sendingAccount` pertama milik tenant, lalu `processSendJobs()` mengirim (Gmail/Outlook/SMTP yang sudah di-connect di Pengaturan → Mailbox).
   - **WhatsApp** → `sendWhatsApp()` via WAHA gateway (`WA_GATEWAY_TOKEN`). Kalau gateway belum aktif, route balas `{ ok:false, needsManual:true }` dan UI mengarahkan ke jalur manual.
2. **Buka per kontak (extension / web — tanpa setup)** — murni client-side, tidak menyentuh server.
   - WhatsApp → buka `wa.me/<digits>?text=…` per kontak (juga jalur yang dipakai extension WA).
   - Email → buka `mailto:` atau **Gmail compose** (`mail.google.com/mail/?view=cm`).
   - Tab dibuka **bertahap** (stagger 350ms) dan **dibatasi 25 sekaligus** supaya browser tidak memblokir popup; sisanya diulang.

## Personalisasi

Token `{{nama}}` (kata pertama nama) dan `{{perusahaan}}` di-render per kontak, baik di subject maupun body. Single atau double brace sama-sama didukung (`{nama}` / `{{nama}}`). Tersedia 3 template starter.

## Berkas

- `components/contacts/send-message-dialog.tsx` — dialog: toggle channel WhatsApp/Email (badge jumlah kontak yang punya HP / email), template, subject (email), body, dua kartu jalur kirim, daftar link per kontak. Ekspor `interface SendContact { id, name, email?, phone?, company? }`.
- `app/api/contacts/send/route.ts` — `POST { contactIds, channel, subject?, body }`. Guard `campaign.manage`. Tenant-scoped (`eq(tenantId)` + `inArray(id)`), jadi tidak bisa blast kontak tenant lain. Mock-safe: tanpa DB balas `{ source:"mock" }`.
- `app/(app)/contacts/page.tsx` — state `sendOpen`, tombol **Kirim Email/WA** di bulk bar, render `<SendMessageDialog>` dengan kontak terpilih dipetakan ke `SendContact`.

## Keamanan / kepatuhan

- Body & subject dikirim **plain-text** (doc 43): tidak ada eksekusi konten kontak.
- Route memfilter `tenantId` eksplisit (RLS off) — kontak yang tidak ada di tenant otomatis terbuang dari `rows`.
- Channel WA tanpa gateway tidak gagal diam-diam — balas `needsManual` sehingga user diarahkan ke `wa.me`.
- Skip dihitung & dilaporkan (kontak tanpa email/HP), tidak dibuang tanpa keterangan.
