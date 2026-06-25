# VPS Integration Status — new-sales-agent

> Last updated: 2026-06-25 08:41 WIB
> VPS: VM-12-138-opencloudos (OpenCloudOS 9.4)

---

## ✅ Done

### 1. Git Repo — Pull Main
- Repo: `pendtiumpraz/new-sales-agent` ✅
- Path: `/root/.openclaw/workspace/new-sales-agent/`
- Origin: `https://github.com/pendtiumpraz/new-sales-agent.git`
- Updated: Yes (76 commits, 145 files, now at `5ecac8f`)
- Branch: `main`

### 2. Scrapling — Installed ✅
- Version: 0.4.9
- Python: 3.11
- Path: `/usr/local/lib/python3.11/site-packages/scrapling/`

### 3. VPS Scraper — Dibuat ✅
- Script: `vps-scraper/scraper.py` — CLI-based web scraper pake Scrapling
  - `python3 scraper.py <url>` — scrape normal
  - `python3 scraper.py <url> --stealth` — anti-bot bypass
  - Output: JSON (company name, description, emails, phones, socials)
- Server API: `vps-scraper/server.py` — REST API (HTTP)
  - `POST /scrape` — scrape URL
  - `GET /health` — health check
  - Port: 8765 (default)
  - Auth: `X-VPS-Scraper-Token` header
- Test: ✅ Scraped gramedia.com → got email, phones, socials, description

### 4. WA Gateway — Setup Siap ✅
- Path: `gateway/index.js` (Baileys-based WhatsApp gateway)
- Path: `gateway/waha/bridge.mjs` (WAHA alternative bridge)
- `npm install` — Done (92 packages)
- `.env` — Created with config
- PM2 ecosystem — Created (`ecosystem.config.cjs`)
- Gateway siap dijalankan, TUNGGU konfirmasi env vars dari Vercel

---

## ⏳ Pending — Butuh Action dari Bos Galih

### 1. WA_GATEWAY_TOKEN — Set di Vercel Dashboard

Gateway butuh **WA_GATEWAY_TOKEN** yang sama di VPS dan Vercel.

**Yang harus dilakukan:**
1. Buka https://vercel.com/almirarana31s-projects/agentic-sales-ai/settings/environment-variables
2. Tambah env var:
   - **Name:** `WA_GATEWAY_TOKEN`
   - **Value:** `6f2327e1cbb246175708fdb19a4eab84ceabf24a44d4ca0234bf8911bfcff4c5`
   - **Environment:** Production
3. Redeploy project (deploy ulang)

> Token ini udah terisi di `.env` gateway di VPS. Kalau mau generate ulang, tinggal bilang.

### 2. VERIFY Vercel Env — Ada env vars yang kosong

Di `.env` workspace (lokal) ada beberapa env kosong yang mungkin perlu diisi di Vercel:
- `HUNTER_API_KEY` — untuk Hunter.io email enrichment
- `DEEPSEEK_API_KEY` — udah terisi ✅
- `CRON_SECRET` — masih kosong
- `AI_GATEWAY_API_KEY` — masih kosong
- `WAHA_BASE_URL` — untuk WAHA Docker (opsional, bisa pake Baileys gateway aja)

### 3. Jalankan Gateway

**Dua opsi:**

**Opsi A — Baileys Gateway (recommended):**
```bash
cd /root/.openclaw/workspace/new-sales-agent/gateway
pm2 start ecosystem.config.cjs
```
Ini polling outbox dari Vercel + handle QR + inbound messages + multi-session.

**Opsi B — WAHA Bridge (butuh Docker):**
```bash
cd /root/.openclaw/workspace/new-sales-agent/gateway/waha
# Setup docker-compose + bridge.mjs
```

### 4. VPS Scraper API — Jalankan bareng Gateway

```bash
# Di port 8765
VPS_SCRAPER_TOKEN=... python3 /root/.openclaw/workspace/new-sales-agent/vps-scraper/server.py &
```

Terus di Vercel API route, panggil `http://<vps-ip>:8765/scrape` untuk scraping berat yang timeout kalo jalan di serverless.

---

## Arsitektur

```
┌─────────────────────────────────────────────────────────────────┐
│  Vercel (new-sales-agent.vercel.app)                            │
│  ┌───────────────────────────────────────┐                      │
│  │  Next.js App Router                    │                     │
│  │  ├─ /api/wa/gateway/outbox  ← polling │ ←─── WA Gateway     │
│  │  ├─ /api/wa/gateway/qr                │      (Baileys)      │
│  │  ├─ /api/wa/gateway/status            │                     │
│  │  ├─ /api/wa/gateway/inbound           │                     │
│  │  ├─ /api/discovery  ← scraping API    │ ←─── VPS Scraper    │
│  │  └─ /api/... (core app)               │      (Scrapling)    │
│  └───────────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
                           ↕ HTTPS (polling + push)
┌─────────────────────────────────────────────────────────────────┐
│  VPS (VM-12-138-opencloudos)                                    │
│  ┌────────────────────┐  ┌──────────────────────────┐           │
│  │  WA Gateway        │  │  VPS Scraper (Scrapling) │           │
│  │  (Baileys)         │  │  Port 8765               │           │
│  │  pm2 managed       │  │  REST API                │           │
│  └────────────────────┘  └──────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```
