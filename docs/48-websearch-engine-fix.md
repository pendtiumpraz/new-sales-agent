# 48 — Websearch enrichment: ganti mesin pencari + ekstraksi raw

## Gejala

Enrich (`/api/profiles/enrich`) "selesai" tapi **tidak menemukan apa-apa** dan profil
tidak berubah — padahal datanya jelas ada di halaman 1 Google (mis. "Adam Suchi Hafizullah"
punya website pribadi + kontak).

## Akar masalah (dua-duanya)

### 1. DuckDuckGo diblokir di Indonesia

`discoverContact/discoverCompany` memakai `html.duckduckgo.com`. Dari ISP Indonesia,
domain itu di-**sinkhole Kominfo** ("Internet Positif") → resolve ke IP `103.x` → **connect
timeout** di tiap request. Jadi setiap pencarian balik `[]`, enrich tak punya apa-apa untuk
disimpan.

Bukti (uji langsung dari jaringan ini):
- DuckDuckGo (html/lite/root): `UND_ERR_CONNECT_TIMEOUT` → `103.181.142.196`, `103.173.75.28`…
- GitHub API & example.com: 200 OK (jaringan sehat) → jadi memang DDG-spesifik.

### 2. Ekstraksi cuma dari teks yang sudah di-strip

Banyak situs (mis. `ashafizullah.com`) **SPA client-rendered** — HTML statiknya nyaris kosong
setelah tag di-strip. Email/HP justru ada di **HTML mentah**: `mailto:`, `tel:`,
`wa.me/<nomor>`, atau JSON tertanam. Strip-dulu = kehilangan semuanya.

## Perbaikan

### Mesin pencari (keyless, semua reachable dari ID)

Uji empiris untuk nama niche Indonesia:

| Engine     | Status | Nemu orangnya? |
|------------|--------|----------------|
| DuckDuckGo | timeout| ❌ (blocked)   |
| **Startpage** | 200 | ✅ website + LinkedIn + GitHub + IG |
| Mojeek     | 200    | ✅ website + blog (backup) |
| Bing       | 200    | ❌ hasil generik ("Adam/Bible") |
| Google direct | 429 | ❌ (rate-limited) |

→ **Startpage primary** (proxy Google), **Mojeek fallback** (kalau Startpage tipis),
**Bing last resort**. Bing pakai redirect `/ck/a?u=<base64url>` → di-decode.

### Ekstraksi dari RAW HTML, tanpa gate injeksi

- `fetchPage()` mengembalikan **`{ text, raw }`** — `text` (di-strip, untuk AI) dan `raw`
  (untuk regex).
- Email: `mailto:` + regex, buang aset/placeholder.
- Telepon: nomor dari `wa.me/`, `tel:`, label ("whatsapp/telp/hp/hubungi") diterima longgar;
  nomor dari teks bebas hanya diterima kalau pola HP Indonesia (`628[1-9]…`). Dinormalisasi
  ke `+62…`, dedup. (Memperbaiki false-positive seperti `0800081250`.)
- Sosmed: dari **URL hasil pencarian** (presisi: host + segmen path) + fallback teks. IG/FB/
  TikTok/YouTube ikut tersimpan ke `person.socials`.
- Ekstraksi regex **selalu jalan** (regex tak bisa di-prompt-inject); hanya **input AI**
  (ringkasan) yang kena `looksInjected`/`wrapUntrusted` (doc 43).

### Refresh UI

`/contacts/profiles` dulu menyimpan **snapshot** baris saat diklik, jadi setelah enrich
sukses (query refetch) sheet masih menampilkan data lama → "profil gak berubah". Sekarang
sheet membaca **data live** dari query (`find` by id), dan enrich meng-invalidate `people` +
`companies`.

## Yang tidak dijanjikan

Kalau sebuah situs memang **tidak** memublikasikan email (cuma WhatsApp + sosmed), enrich
mengembalikan apa yang ada — tidak mengarang. "Anything from page 1" = ekstrak yang benar-benar
ada di hasil & halaman, bukan menebak.

## Bukan solusi: LLM sebagai search

DeepSeek (API `deepseek-chat`) **tidak bisa browsing** — kalau dipakai "mencari" ia akan
mengarang email/HP (langgar doc 43). LLM tetap hanya untuk ringkasan atas teks yang sudah
diambil mesin pencari.
