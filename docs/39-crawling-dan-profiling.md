# Doc 39 — Crawling & Profiling: Metode, Flow, & FORD

Dokumen ini menjawab: **backend-nya apa, crawl di mana, metodenya gimana, flow-nya
seperti apa**, dan **rumusan profiling** (umur, gender, ketertarikan, FORD) — jujur
mana yang realistis dari crawl publik vs yang butuh sumber lain / percakapan.

---

## 0. Arsitektur singkat (biar gak bingung)

**Tidak ada backend terpisah.** Semua jadi satu di **Next.js App Router**:
- **"Backend" = API routes** (`app/api/*`) yang jalan sebagai **serverless function** (di Vercel) / Node.js process (lokal).
- **Database = Postgres** (Neon / Vercel Postgres).
- **Engine = `lib/*`** (crawl, profiling, AI meter, cadence, dst).

**Crawl ada di mana:** `lib/crawl/web.ts` + `lib/crawl/hunter.ts`, dipanggil dari
**`app/api/discovery/route.ts`** (`runtime = "nodejs"`). Crawl = **server-side
`fetch()`** ke website target. **Bukan** service crawler terpisah.

> ⚠️ **Kenapa bisa "gak crawl" di deploy:**
> 1. **Env DB belum di-set di Vercel** → `hasDb()` false → `/api/discovery` balik
>    mock tanpa crawl. **Wajib set** `POSTGRES_URL` (+ non-pooling) di Vercel.
> 2. **Timeout serverless** (Hobby ~10s). **Sudah diperbaiki**: `crawlWebsite()`
>    punya **budget total 12s** → return hasil parsial sebelum function 504.

---

## 1. Metode crawling (per sumber)

| Sumber | Metode | Data yang didapat | Status |
|---|---|---|---|
| **Website** | `fetch` halaman publik (homepage + `/contact` + `/about` + `/kontak` + `/tentang-kami`) → regex extract | nama company, domain, deskripsi, **email**, **telepon/WA**, **sosmed** (LI/IG/FB/X) | ✅ **live** (`lib/crawl/web.ts`) |
| **Hunter.io** | `domain-search` API | **orang**: nama, **jabatan**, departemen, **seniority**, email, LinkedIn, telepon | ✅ wired (`lib/crawl/hunter.ts`, butuh `HUNTER_API_KEY`) |
| Google Places | Places API (Text/Details) | lokasi, alamat, telepon, rating, website | 💡 rencana (nyambung peta) |
| **LinkedIn (extension RPA)** | Chrome extension scrape DOM (auth-gated) | **profil orang lengkap**: pengalaman, **pendidikan** (→ umur), skills, posisi, postingan | 💡 rencana (`extension/`) |
| Social (IG/X) | scrape/API publik | **ketertarikan/recreation**, gaya bahasa | 💡 rencana |
| Email/phone finder | Hunter verifier / MX | validasi & enrich | 🟡 sebagian (validasi MX live) |

**Inti:** dari **website** dapat data **company-level** + sosmed. Dari **Hunter/LinkedIn**
dapat data **orang-level** (yang penting buat profiling FORD).

---

## 2. Flow end-to-end

```
[1] DISCOVERY  (UI: /contacts/discovery — URL | bidang | bulk | auto)
        │  POST /api/discovery {kind,url,posture}
        ▼
[2] CRAWL ADAPTER
        ├─ website  → crawlWebsite(url)        → company + kontak company-level
        └─ hunter   → hunterDomainSearch(domain) → orang + kontak per-orang
        ▼
[3] NORMALIZE + DEDUP   (lib/profiling/dedup.ts)
        normalizeDomain/Name/ContactValue + stableId(sha1(dedupKey))
        → company / person / contact_point  (idempotent: re-crawl = upsert)
        ▼
[4] PROFILING ENGINE   ← yang dirumuskan di §3 (BELUM diimplement)
        derive: gender+honorific · age band · occupation · interests · FORD
        + AI synthesis → ringkasan profil + sudut pendekatan + nada/sapaan
        ▼
[5] STORE   person.{gender,honorific,age_band,interests,ford,profile_summary}
            + profile_insight (skor keyakinan per dimensi)
        ▼
[6] MESSAGING   cadence / upsell / auto-reply / draft
        prompt WAJIB pakai honorific (Pak/Bu/Mas/Mbak) + ≥1 referensi FORD + empati
        → pesan terasa manusia, bukan "AI banget"
```

Saat ini flow jalan **[1]→[3]** (real). **[4]–[6] profiling belum diimplement** — itu
yang dirumuskan di bawah.

---

## 3. RUMUSAN PROFILING

### 3.1 Demografi

| Atribut | Sumber crawlable | Metode derivasi | Realistis? |
|---|---|---|---|
| **Gender** | nama depan; honorific di teks (Bapak/Ibu/Mr/Mrs); LinkedIn pronoun | kamus **nama Indonesia → gender** (mis. "Siti/Ani"→F, "Budi/Agus"→M) + fallback AI klasifikasi; honorific menang kalau eksplisit | ✅ tinggi (nama Indonesia cukup informatif) |
| **Honorific** (Pak/Bu/Mas/Mbak) | turunan dari gender + seniority/umur | aturan di §3.4 | ✅ |
| **Umur (band)** | LinkedIn: tahun lulus / lama pengalaman; else seniority | lulus+22 ≈ umur; atau seniority→band (junior 22–30, mid 30–40, senior 40+) | 🟡 **band/estimasi**, bukan angka pasti |
| **Lokasi** | company HQ, Google Places, LinkedIn location | langsung | ✅ (company), 🟡 (orang) |

> **Jujur:** umur **tidak** bisa pasti dari web. Yang realistis = **rentang** dari
> sinyal karier. Jangan ngarang angka.

### 3.2 FORD (Family · Occupation · Recreation · Dreams)

FORD = kerangka rapport sales. Realistis dari crawl, dari yang **paling bisa** ke
**paling susah**:

| Dimensi | Sumber | Metode | Feasibility | Catatan PDP/etika |
|---|---|---|---|---|
| **O — Occupation** ⭐ | website, Hunter, LinkedIn | title + dept + seniority + company + industri | **TINGGI** (inti) | aman (info profesional) |
| **R — Recreation / interest** | sosmed (IG/X), konten, grup, industri | AI klasifikasi konten → tags minat | **SEDANG** (butuh adapter sosmed) | hati-hati, publik only |
| **F — Family** | sosmed pribadi | — | **RENDAH + RISIKO PDP TINGGI** | **JANGAN crawl ranah pribadi**. Isi manual / dari percakapan, dengan consent |
| **D — Dreams / goals** | trajectory karier, konten, goal perusahaan | AI infer (low confidence) | **RENDAH** | tandai "inferred", verifikasi saat ngobrol |

> **Prinsip:** **Occupation** itu pondasi (crawlable + aman). **Recreation** bonus dari
> sosmed publik. **Family/Dreams** sebagian besar **bukan dari crawl** — itu hasil
> riset manual + percakapan, dan Family **sensitif** (PDP) → default **tidak** diambil.

### 3.3 Ketertarikan (interests)

- **Sumber:** industri perusahaan + jabatan (sinyal lemah tapi selalu ada) → konten
  sosmed/grup (sinyal kuat, butuh adapter).
- **Metode:** AI klasifikasi → array tags (mis. `["logistik","supply-chain","teknologi"]`)
  + skor keyakinan.

### 3.4 Aturan sapaan (honorific) — biar SOPAN & ber-empati

```
gender = female:
   senior / formal  → "Ibu {NamaDepan}"  (sapaan: "Bu")
   muda / akrab      → "Mbak {NamaDepan}"
gender = male:
   senior / formal  → "Bapak {NamaDepan}" (sapaan: "Pak")
   muda / akrab      → "Mas {NamaDepan}"
gender = unknown:
   → "Kak {NamaDepan}"  atau  "{NamaDepan}"  (hindari "Bapak/Ibu" generik)
```

- "Senior/formal" dari **seniority** (Manager/Director/Owner) atau age band 40+.
- **Wajib** ada di SEMUA prompt messaging + **dilarang** nada robotik / placeholder
  `{nama}` bocor / nyebut "sebagai AI".

---

## 4. Skema yang perlu ditambah (rumusan, belum diimplement)

```
person  (+ kolom profiling):
  gender            text     -- male | female | unknown
  honorific         text     -- Pak | Bu | Mas | Mbak | Kak
  age_band          text     -- 22-30 | 30-40 | 40+ | unknown
  interests         jsonb    -- string[] tags
  ford              jsonb    -- { occupation, recreation, family, dreams, confidence }
  profile_summary   text     -- ringkasan AI 2-3 kalimat
  profile_confidence real    -- 0..1

profile_insight  (opsional, atau extend positioning_insight):
  per-dimensi: value + source + confidence  (audit trail profiling)
```

---

## 5. Roadmap implementasi (urut prioritas)

1. **Schema profiling** (kolom di `person` + index).
2. **name→gender + honorific** (kamus nama Indonesia + fallback AI; honorific dari §3.4).
3. **seniority→age band** (mapping deterministik).
4. **AI profile synthesis**: 1 panggilan metered yang ambil {nama, jabatan, dept,
   company, industri, interests} → `profile_summary` + `ford.occupation` +
   `interests` + honorific. (Family/Dreams ditandai "perlu percakapan".)
5. **Wire honorific + nada empati** ke semua prompt messaging (cadence/upsell/
   auto-reply/draft) — ganti "Halo Bapak/Ibu {nama}" generik.
6. **(nanti)** adapter **LinkedIn (extension)** + **sosmed** untuk Recreation/Dreams +
   age band yang lebih akurat.

---

## 6. Etika & kepatuhan (UU PDP)

- **Company-level** (email/telepon/sosmed perusahaan): risiko rendah.
- **Human-level** (WA/email/sosmed **pribadi**): butuh dasar **legitimate interest** /
  **consent**, hormati `posture` + `consent_status`. Simpan **provenance** (sudah ada:
  `source`, `source_url`).
- **Family / ranah pribadi**: **default tidak diambil** dari crawl. Hanya manual +
  consent.
- Posture `aggressive` ≠ melanggar hukum — tetap di koridor PDP.
