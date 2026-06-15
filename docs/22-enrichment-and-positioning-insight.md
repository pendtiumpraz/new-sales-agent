# 22 — Enrichment & positioning insight (vision)

> Status: design spec. **Ini value-prop aslinya.** Lihat
> [overview](./18-saas-architecture-overview.md).

## Apa yang dijual

Crawling itu komoditas. Yang bikin orang bayar: **"gimana produk SAYA bisa masuk
ke prospek ITU"** — angle pitch konkret, bukan sekadar data. Inilah yang kamu
sebut "insight cara memasukkan product user terhadap product client".

## Tahap 0 — AI nentuin target market (product → ICP)

Sebelum crawl, AI baca **`product`** tenant (value props, kategori) lalu nurunin:
- `target_market`: **B2B / B2C / both**.
- `icp` (ideal customer profile): industri/bidang, ukuran, region, role pembeli.

ICP ini jadi **input discovery** (doc [21]): user bisa pilih "cari company di
bidang X" lalu AI nyaring pakai ICP, **atau** AI yang nyaranin bidang/company yang
paling cocok sama product. Hasil derivasi disimpan (`product.target_market`,
`product.icp`) dan boleh di-edit user.

## Dua tahap

### a. Enrichment (raw → profil terstruktur)
Dari payload crawl (doc [21]) → AI + heuristik isi:
- `company.summary` — ringkasan bisnis prospek.
- Pain points / sinyal niat (hiring, pricing visit, tech migration, berita).
- Produk/posisi prospek (apa yang mereka jual, ke siapa).
- `tech_stack`, firmographics.

### b. Positioning insight (profil + product tenant → angle)
Input: `company` (prospek) **×** `product` tenant (doc [20]). Output terstruktur:

```
positioning_insight (id, tenant_id, company_id, product_id,
  fit_score,                 -- 0..100, kenapa cocok / nggak
  angle,                     -- sudut masuk utama (1 kalimat)
  rationale[],               -- alasan berbasis sinyal prospek
  objections[],              -- keberatan yang mungkin + counter
  entry_contacts[],          -- person mana yang paling tepat dihubungi (+kenapa)
  recommended_channel,       -- email / WA / linkedin
  draft_opener,              -- pembuka ter-personalisasi (per channel)
  generated_by_model, generated_at)
```

`fit_score` + `angle` itu yang tampil di layar Prospek; `draft_opener` nyambung
langsung ke outreach (doc [23]).

## Kenapa terstruktur (bukan blob teks)

Output JSON terskema (validasi zod) supaya: bisa di-rank, di-filter, dipakai
ulang di cadence, dan **auditable** (model apa, kapan, basis sinyal mana). Pakai
structured output dari AI registry (doc [24]).

## Grounding (anti-halusinasi)

Insight **harus** mereferensikan sinyal nyata dari data crawl + KB produk tenant
(reuse `lib/api-mock/kb.ts` → KB nyata). Tiap `rationale` idealnya nunjuk ke
`source_url`. Tanpa grounding, "insight" cuma tebakan yang malu-maluin pas demo.

## Relasi ke existing

- `ProspectSheet` "Riset AI" + "Pesan pembuka rekomendasi AI" (doc 17) = versi
  awal fitur ini. Target: pisahin enrichment vs positioning, jadiin per-product,
  simpan hasilnya (bukan regenerate tiap buka).
- `lib/api-mock/enrichment.ts` + `kb.ts` jadi basis engine nyata.

## Target modules

```
lib/enrichment/             pipeline raw → company/person profile
lib/positioning/            engine (company × product → insight), prompt + schema
lib/db/schema.ts            +product, positioning_insight
lib/ai/                     dipanggil lewat registry (doc 24), structured output
components/prospecting/     ProspectSheet pakai insight tersimpan + fit_score
```
