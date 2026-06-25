# Maira WA + Discovery Bridge (Chrome extension, MV3) v0.3.0

Extension multi-platform buat Maira Sales:

1. **WhatsApp** — reply-only gateway (paced AI bubbles), jalan di tab WA Web.
2. **Discovery** — extract lead dari **6 platform** sekaligus → simpan ke Maira.

## Platform Discovery

| Platform | Deteksi otomatis | Data yang diambil |
|----------|-----------------|-------------------|
| **LinkedIn** | `/in/*` / `/company/*` | Nama, title, lokasi, company |
| **Instagram** | Halaman profil | Nama, bio, website |
| **Facebook** | Halaman publik | Nama page, deskripsi, followers |
| **TikTok** | `@username` | Nama, bio, followers/following |
| **Shopee** | Produk / Search | Nama produk, harga |
| **Google** | `/search?q=...` | Hasil pencarian (title, url, snippet) |

## Cara pakai

1. `chrome://extensions` → **Developer mode** → **Load unpacked** → pilih folder ini.
2. **Pengaturan**: isi Backend URL, Gateway token, Ingest token.
3. **WA**: buka `web.whatsapp.com` → login → extension → Aktifkan.
4. **Discovery**: buka halaman LinkedIn / IG / FB / TikTok / Shopee / Google → floating widget muncul → pilih platform dari dropdown → **➕ Simpan ke Maira**.

## Fitur baru v0.3.0
- ✅ **6 platform** (LinkedIn, Instagram, Facebook, TikTok, Shopee, Google Search)
- ✅ **Dropdown pilih platform** — gak cuma auto-detect, user bebas milih
- ✅ Platform bisa di-enable/disable satu per satu di Pengaturan
- ✅ Widget floating muncul otomatis sesuai halaman yang dibuka

## Files
- `manifest.json` — MV3, semua platform terdaftar di host_permissions + content_scripts.
- `background.js` — network handler (poll / ack / inbound / ingest / classify).
- `content.js` — WhatsApp Web DOM bridge.
- `discovery.js` — **Multi-platform extractor** + floating widget + dropdown.
- `popup.html`/`popup.js` — status + tes koneksi.
- `options.html`/`options.js` — config semua platform.

## ⚠️ Risiko
- WA Web automation → melanggar ToS WhatsApp. Risiko ban di nomor pribadi.
- Scraping LinkedIn/IG/FB/TikTok → melanggar ToS masing-masing platform.
- Pakai volume rendah, nomor warm, jangan cold blast.
