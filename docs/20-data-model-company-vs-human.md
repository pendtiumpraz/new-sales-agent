# 20 — Data model: Company vs Human (vision)

> Status: design spec. Inti dari permintaan "profiling biar contact-nya kepilah".
> Lihat [overview](./18-saas-architecture-overview.md).

## Prinsip: dua jenis subjek, satu jenis contact point

Kamu mau bisa misahin **company contact** dari **human contact**. Caranya: dua
entity subjek (`company`, `person`) + satu tabel contact polymorphic
(`contact_point`) yang nyimpen provenance & consent di tiap baris.

```
company        (id, tenant_id, name, domain, industry, size, hq_country,
                summary, tech_stack[], products[], socials{}, status)
person         (id, tenant_id, company_id?, full_name, title, department,
                seniority, location, socials{}, status)
contact_point  (id, tenant_id, owner_type ENUM(company|person), owner_id,
                channel ENUM(email|phone|whatsapp|linkedin|instagram|web|other),
                value, label,                              -- mis. "email kerja"
                source,                                     -- provenance (doc 21)
                source_url, captured_at, captured_mode,     -- compliant|aggressive
                consent_status ENUM(unknown|legitimate_interest|opted_in|opted_out),
                verified_at, is_primary)
```

- **Company vs Human kepilah natural** lewat `owner_type`. "WA company / email
  company / sosmed company" = `contact_point` milik `company`. "WA / email /
  sosmed orang di bidang tertentu" = `contact_point` milik `person` (yang
  `company_id`-nya nunjuk ke company-nya, dan `title`/`department`/`seniority`
  buat filter "bidang tertentu").
- **Provenance & consent first-class.** Tiap nilai kontak nyimpen *dari mana*
  (`source`, `source_url`), *kapan*, *mode apa* (`captured_mode`), dan *status
  consent*-nya. Ini yang bikin kamu bisa: (a) filter outreach cuma ke yang boleh
  dikontak, (b) buktiin legalitas data saat audit PDP. Detail di doc [25].

## Profil yang di-crawl

`company.summary`, `tech_stack`, `products` diisi engine enrichment (doc [22])
dari hasil crawl (doc [21]). `person` ditemukan via contact discovery (mis.
LinkedIn search lewat extension) lalu di-link ke `company`.

## Relasi ke fitur existing

- `ProspectLead` (doc 17) sekarang nyampur orang+company jadi satu baris. Target:
  pecah jadi `person` + `company` + `contact_point`. `ProspectLead` jadi **view**
  (person join company) buat layar Prospek, bukan tabel mentah.
- `contacts` (doc 10) jadi konsumen `person`/`company` yang udah masuk CRM.
- **Product tenant** (buat positioning) tinggal di `product` per tenant — ini yang
  dipasangin ke `company` prospek buat hasilin angle (doc [22]). AI nurunin
  `target_market` (B2B/B2C) + `icp` dari product (doc [22] Tahap 0); ICP inilah
  yang **nyetir discovery** (doc [21]) saat user pilih bidang atau AI auto-cari.

```
product        (id, tenant_id, name, category, value_props[], pricing_notes,
                target_market,            -- AI-derived: B2B | B2C | both
                icp{})                    -- AI-derived ICP: industri/bidang, size, region, role
```

## Dedup & identity resolution

Crawl dari banyak sumber → banyak duplikat. Butuh:
- **Company:** kunci dedup utama = `domain` (ternormalisasi). Fallback fuzzy name.
- **Person:** kunci = (`company_id` + nama ternormalisasi) atau profil sosial.
- `contact_point` di-dedup per (`owner`, `channel`, `value`).
- Merge nyimpen semua `source` (provenance gak hilang pas merge).

## Target modules

```
lib/db/schema.ts            +company, person, contact_point, product
lib/types/contacts.ts       Company, Person, ContactPoint, ContactChannel, ConsentStatus
lib/profiling/dedup.ts      identity resolution (domain/name/social)
lib/api-mock/ → lib/api/    accessor + query per-tenant (lewat RLS)
app/(app)/contacts/         UI tab "Perusahaan" vs "Orang"
```
