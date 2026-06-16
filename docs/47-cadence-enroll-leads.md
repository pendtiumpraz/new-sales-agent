# 47 — Memasukkan lead/profil ke cadence

## Masalah

Cadence enrollment berbasis **kontak** (`contacts` table) — processor butuh nama/email/HP
dari `contacts`. Tapi hasil crawl/discovery ada di tabel **`person`** (lead/profil), bukan
`contacts`. Jadi lead/profil tidak bisa langsung di-enroll ke cadence.

## Solusi (Approach A: convert → enroll)

Lead/profil **dijadikan kontak dulu**, lalu di-enroll. Satu endpoint melakukan keduanya
secara idempotent.

### `POST /api/profiles/to-contact`

Body: `{ personId, cadenceId? }`

1. Ambil `person` (+ nama perusahaan via `companyId`, + email/telepon dari `contact_points`).
2. **Upsert** ke `contacts` dengan id deterministik `stableId("ct", "<tenant>:person:<personId>")`
   — jadi re-run tidak menggandakan, hanya me-refresh (nama/jabatan/perusahaan/email/HP).
   `channelPreference` = `whatsapp` kalau ada HP, else `email`.
3. Kalau ada `cadenceId`: cek enrollment existing (cadence+contact); kalau belum ada →
   insert `cadence_enrollments` (`status: aktif`, `currentStepIdx: 0`) + `cadences.enrolled += 1`.

Return `{ ok, contactId, enrolled }`. `enrolled=false` artinya kontaknya sudah terdaftar
di cadence itu (tidak digandakan).

## UI

Di **sidebar detail profil** (`ProfileDetailSheet`, tampilan Orang) ada seksi
**"Masukkan ke cadence"**: dropdown cadence aktif + tombol **Daftarkan**. Memanggil
`to-contact` dengan `personId` + `cadenceId` terpilih, lalu invalidate `["contacts"]` +
`["cadence-enrollments"]` supaya halaman cadence langsung ter-update.

Kontak (bukan lead) tetap di-enroll lewat halaman cadence (`/cadences/[id]` → "Daftarkan kontak").

## Catatan

- Konversi person→contact **idempotent** — aman dipanggil berulang.
- Email/HP ikut dari `contact_points` person (hasil enrich web — lihat doc 48).
