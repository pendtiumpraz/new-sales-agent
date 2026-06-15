# 25 — Compliance & data governance (vision)

> Status: design spec. **Bukan tempelan — ini yang bikin produk gak mati.**
> Memperluas `docs/15-settings-compliance.md` ke ranah crawl & PII. Lihat
> [overview](./18-saas-architecture-overview.md).

## Kenapa ini layer first-class

Di kategori sales-intelligence, yang membunuh produk: **ban akun** (WA/LinkedIn)
& **hukum** (UU PDP Indonesia, GDPR kalau ada subjek EU). Compliance = fitur yang
bikin (a) akun user gak kebakar, (b) produk bisa lolos audit & dijual ke
enterprise. Berlaku di **semua posture mode** (doc [21]) — termasuk `aggressive`.

## Provenance & lawful basis

Tiap `contact_point` (doc [20]) nyimpen `source`, `source_url`, `captured_at`,
`captured_mode`, `consent_status`. Ini bukti **dari mana** data & **dasar hukum**
apa (legitimate interest B2B vs opt-in). Tanpa provenance, gak ada cara
mempertanggungjawabkan data → risiko PDP.

## Consent & suppression

- `consent_status`: `unknown | legitimate_interest | opted_in | opted_out`.
- **Suppression list per tenant** (+ global platform): siapa pun yang `opted_out`,
  bounce keras, atau complaint **gak boleh** dikontak lagi — ditegakkan di **worker
  kirim** (doc 23), bukan cuma UI.
- Tiap email outbound: **link unsubscribe** + footer pengirim (CAN-SPAM/PDP).
- Honor unsubscribe **otomatis** → tulis ke suppression, real-time.

## Guardrail crawling (per mode)

| Aturan | compliant | balanced | aggressive |
|--------|-----------|----------|------------|
| robots.txt | wajib hormati | hormati | best-effort + warning |
| Rate limit | konservatif | sedang | **ketat** (anti-ban) |
| Data personal | hanya consent | human review | human-in-the-loop + consent eksplisit tercatat |
| Banner risiko ToS | — | info | **wajib, di-`audit_log`** |

Mode agresif **tetap** kena suppression, provenance, & retensi — yang beda cuma
sumber & kecepatan, bukan governance.

## PII handling

- **Klasifikasi field** PII (email, phone, nama, dll) → kontrol akses + masking
  (mirip "masked until enriched" di doc 17).
- **Enkripsi** kredensial & data sensitif at rest (doc 23/24).
- **Retensi & hapus:** kebijakan TTL per jenis data; **DSAR** (subjek minta akses/
  hapus data) → tool hapus per-subjek lintas tabel.
- **Data residency:** catat region; opsi tenant enterprise minta isolasi (doc 19).

## Audit trail

`audit_log` (doc 19) nyatat aksi sensitif: aktifkan mode agresif, connect mailbox,
export data, hapus subjek, ubah model AI. Superadmin (doc 26) bisa review.

## Target modules

```
lib/compliance/suppression.ts   cek & tulis suppression (dipanggil send worker)
lib/compliance/consent.ts       state machine consent + honor unsubscribe
lib/compliance/retention.ts     TTL + DSAR (export/delete per subjek)
lib/compliance/pii.ts           klasifikasi + masking
app/(app)/settings/compliance   extend layar existing (doc 15)
app/unsubscribe/                halaman opt-out publik
```
