# 29 — Use cases & flexibility (playbooks)

> Status: design spec. Platform ini **bukan cuma "B2B sales tool"** — ini **mesin
> audience-intelligence + outreach** yang fleksibel. B2B sales cuma playbook
> unggulan. Lihat [overview](./18-saas-architecture-overview.md).

## Insight inti: satu mesin, banyak use-case

Mesinnya tetap sama:

```
definisi objektif → AI nurunin audiens target → discover & crawl (doc 21)
  → AI profiling (doc 22) → angle pesan sesuai objektif → outreach multi-channel
  dari identitas user (doc 23) → track
```

Yang **ganti** antar use-case cuma 4 hal:
1. **Objektif** — jual produk / rekrut / undang event / cari partner / cari investor…
2. **Definisi audiens** — company (industri/size/negara) atau person (role/skill/lokasi).
3. **Angle pesan** — value prop produk vs pitch lowongan vs undangan event.
4. **Channel mix** — email / LinkedIn / WA / IG, + bahasa & lokalisasi.

## Playbook = template use-case

Tiap **playbook** nge-preset objektif + filter audiens + template pesan + channel
mix + default posture/compliance. User pilih playbook → isi spesifik → jalan.
Engine, data model, dan compliance **gak berubah**.

## Katalog use-case (contoh — bisa nambah terus)

| Playbook | Audiens | Objektif / angle | Channel |
|----------|---------|------------------|---------|
| B2B sales (domestik) — *flagship* | company by industri/size + decision maker | "produkmu cocok karena…" | email/WA/LinkedIn |
| **B2B sales luar negeri** | company by negara/industri | sama + **lokalisasi bahasa & jam kirim** | email/LinkedIn |
| Recruiting / talent sourcing | person by skill/role/seniority (mis. IT engineer) | pitch role + kenapa kandidat cocok | LinkedIn/email |
| Sebar lowongan | kandidat/komunitas relevan | broadcast lowongan ter-target | LinkedIn/WA/email |
| Promosi & undangan event | person by role/industri | undangan + alasan relevan | email/WA |
| Partnership / BD | company komplementer | ajakan kerjasama | email/LinkedIn |
| Investor outreach | investor by thesis/stage/geo | pitch ringkas | email |
| Influencer / creator | creator by niche/audiens | ajakan kolaborasi | email/IG |
| Reseller / affiliate | bisnis kandidat reseller | ajakan jadi reseller | WA/email |
| Agency (multi-client) | per klien (tenant) | kampanye atas nama klien | semua |

Semua di atas dilayani **mesin yang sama** — bedanya cuma preset playbook.

## Yang berubah di arsitektur (kecil — bukan rombak)

- `product` digeneralisasi → **`offer` / `objective`** (bisa produk, lowongan, event,
  ajakan partner, dll). "ICP derivation" (doc [22] Tahap 0) jadi **"audience
  derivation"** buat objektif apa pun.
- `positioning_insight` digeneralisasi → **"outreach angle"** untuk (target ×
  objektif): "kenapa kandidat ini cocok role ini", "kenapa CTO ini perlu hadir
  event-mu", "kenapa company ini partner yang pas".
- **`playbook`** (baru): preset objektif + filter audiens + template + channel + posture.
- `company` / `person` / `contact_point` / cadence / mailbox / AI registry — **udah
  generik**, gak berubah.

**Konsekuensi penting:** fondasi Fase 1–8 (tenant/RLS/RBAC, data model, acquisition,
AI registry, engagement, compliance) **tidak berubah**. Playbook itu **layer config
+ framing** di atasnya. Ekspansi use-case ≠ rombak build. Generalisasi
`product → offer/objective` + tabel `playbook` masuk natural di Fase 2 & 4.

## Compliance per use-case (doc [25])

Beda use-case beda profil hukum:
- **Domestik** → UU PDP.
- **Luar negeri (EU)** → **GDPR** (lebih ketat: consent, hak subjek).
- **Recruiting** → aturan data kandidat per yurisdiksi.

Layer consent/suppression/provenance + posture mode (doc [21]/[25]) udah nanganin;
playbook tinggal set **default posture + bahasa consent** sesuai yurisdiksi audiens.
Outbound luar negeri = sinyal kuat buat default ke posture lebih `compliant`.

## Target modules

```
lib/playbooks/              definisi playbook (preset objektif/audiens/pesan/channel/posture)
lib/db/schema.ts            generalisasi product → offer/objective; +playbook
lib/positioning/            angle generik (target × objektif), bukan cuma product-fit
app/(app)/                  pemilih playbook saat bikin kampanye
```

[22]: ./22-enrichment-and-positioning-insight.md
[21]: ./21-data-acquisition-crawling-mcp-rpa.md
[23]: ./23-outreach-email-identity-and-deliverability.md
[25]: ./25-compliance-and-data-governance.md
