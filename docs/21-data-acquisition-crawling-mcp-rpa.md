# 21 — Data acquisition: crawling, MCP & RPA (vision)

> Status: design spec. Lihat [overview](./18-saas-architecture-overview.md) &
> [compliance](./25-compliance-and-data-governance.md).

## Dua jalur akuisisi

1. **Server-side crawl/enrich** lewat **MCP server** — buat data publik & API
   resmi. AI agent manggil tool, hasil masuk pipeline enrichment.
2. **Chrome extension RPA** — buat sumber yang nge-block bot / butuh login (mis.
   **LinkedIn search**). Jalan **di browser user, pakai sesi login user sendiri**,
   buffer ke **local storage**, lalu **sync ke platform**.

## Titik masuk discovery (dipilih user)

Discovery bisa dimulai dari beberapa cara; semua ngisi antrian `crawl_job` dan
**semua hasil disimpan ke DB** (company/person/contact_point, doc [20]):

1. **URL company manual** — user tempel website company → crawl company itu langsung.
2. **Pilih bidang/industri (disesuaikan product)** — user pilih vertical; AI nyaring
   kandidat company pakai **ICP** dari product (doc [22] Tahap 0), atau AI nyaranin
   bidang yang paling cocok sama product.
3. **List nama company (bulk)** — user input banyak nama company target; AI **nge-list
   & antri satu per satu**, crawl satu per satu cari detail, simpan tiap hasil. Tiap
   nama → resolve ke `domain` → `crawl_company` → `find_*`.
4. **Auto (AI-driven)** — dari `target_market`/ICP, AI generate sendiri daftar company
   + orang kandidat lalu crawl.

Tiap entri jadi `crawl_job` terpisah (observable & resumable, doc [26]).

## Discovery cascade (kalau contact gak ketemu)

Kalau company target gak punya contact yang usable, **jangan berhenti** — ekspansi:
1. Crawl **company terkait** (induk/anak, kompetitor, partner, satu industri).
2. Cari **orang terkait** di company itu pada role/bidang target (doc [20] `person`).
3. Ulang sampai dapat contact ber-consent atau batas kedalaman tercapai.

Cascade tunduk posture mode + rate-limit (di mode agresif tetap dibatasi anti-ban).
Semua company/person hasil ekspansi disimpan dengan provenance
(`source = "cascade:<alasan>"`), jadi jelas asal-usulnya.

## Posture mode (dipilih user)

Crawling posture itu **setting per-tenant/per-campaign**, bukan hardcoded:

| Mode | Sumber | Rate & guardrail |
|------|--------|------------------|
| `compliant` | Web publik (hormati robots.txt), API resmi, data opt-in | Pelan, konservatif, hanya channel ber-consent buat outreach |
| `balanced` | + halaman publik yang gak dilarang ToS, direktori | Rate sedang, human review sebelum simpan kontak personal |
| `aggressive` | + RPA di belakang login (LinkedIn dll) via akun user | Rate dibatasi **ketat** (anti-ban), wajib human-in-the-loop |

**Catatan engineering (bukan moral):** di mode agresif, yang bikin akun
LinkedIn/WA kena ban itu **kecepatan & pola robotik**, bukan keberadaan tool.
Jadi rate-limit, jitter, jam manusiawi, dan **pakai akun user sendiri** itu
**fitur proteksi user**, bukan rem. Opt-out + suppression + provenance jalan di
**semua mode** (doc [25]) — itu yang bikin produk tetap bisa dijual ke enterprise.

## MCP server (tangan si AI agent)

MCP = antarmuka tool standar yang dipanggil agent. Tool inti:

```
crawl_company(domain|name)      → summary, industry, size, tech, products, news
find_company_contacts(company)  → email/WA/sosmed level-company (+ provenance)
find_people(company, filters)   → person di "bidang tertentu" (title/dept/seniority)
enrich_person(person)           → contact point + verifikasi
verify_email(value)             → status deliverable (SMTP/MX check via ESP)
```

Tiap tool **wajib stamp provenance** (`source`, `source_url`, `captured_at`,
`captured_mode`) ke `contact_point`. Tool tunduk ke posture mode aktif: di
`compliant`, `find_people` cuma balikin yang dari sumber yang diizinkan.

## Chrome extension RPA

Komponen terpisah dari app Next.js, tapi 1 produk.

```
Arsitektur:
  content script  → jalan di tab LinkedIn/sumber lain, baca DOM hasil search
  background SW    → antrian kerja, rate-limit, jitter, retry
  local storage    → buffer hasil (tahan kalau offline / tab ditutup)
  sync client      → POST batch ke platform (auth token tenant+user), idempotent
```

- **Sesi user:** extension beroperasi sebagai user yang login — gak ada kredensial
  platform yang nyimpen password LinkedIn.
- **Local-first:** scrape → simpan lokal → sync. Tahan banting kalau koneksi
  putus; user lihat antrian & bisa pause.
- **Guardrail:** daily cap per akun, randomized delay, "human pace", dan banner
  peringatan ToS pas user nyalain mode agresif (consent eksplisit, tercatat di
  `audit_log`).
- **Sync endpoint:** `POST /api/ingest/contacts` (batch, idempotent by dedup key),
  validasi schema (zod), masuk pipeline dedup (doc [20]) → enrichment (doc [22]).

## Pipeline akuisisi (end-to-end)

```
[MCP tool | RPA extension] → raw payload (+provenance)
   → /api/ingest (zod validate, idempotent)
   → dedup / identity resolution (lib/profiling/dedup.ts)
   → enrichment + positioning (doc 22)
   → company/person/contact_point (RLS, per tenant)
```

## Target modules

```
mcp-server/                 server MCP (tools crawl/find/enrich/verify)
extension/                  Chrome MV3: content + background + sync (repo/worktree terpisah)
app/api/ingest/             endpoint terima batch dari MCP & extension
lib/acquisition/posture.ts   mode + guardrail per tenant
lib/acquisition/discovery.ts entry points (URL/industri/bulk-list/auto) → crawl_job
lib/acquisition/cascade.ts   ekspansi company & orang terkait kalau contact kosong
lib/profiling/dedup.ts       identity resolution
lib/db/schema.ts            +crawl_job, ingest_batch (observability doc 26)
```
