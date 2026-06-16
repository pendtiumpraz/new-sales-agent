# Doc 42 — Kontrak WA Gateway (Vercel ⇄ VPS)

Sisi **Vercel sudah jadi** (doc 41). Yang perlu kamu jalankan di VPS = **gateway**
(Baileys/openclaw) yang **outbound-only**: poll kerjaan + push hasil. **Tanpa
domain/port** di VPS. Set `WA_GATEWAY_TOKEN` (env) sama di Vercel & gateway.

## Mode (di-set superadmin)
`platform_setting.wa_mode` = `per_sales` | `per_platform`. `sessionId`:
- per_sales → `rep:<userId>` (1 sesi per sales)
- per_platform → `platform:<tenantId>` (1 sesi bersama)

## Yang harus dilakukan gateway (loop tiap ~3–5 dtk)
Semua request bawa header `x-wa-gateway-token: <WA_GATEWAY_TOKEN>`.

1. **Poll kerjaan** → `GET /api/wa/gateway/outbox` → `{data:[{id,sessionId,action,payload}]}`
   - `start_session` → mulai sesi WA untuk `sessionId`. WA kasih QR → push (lihat #2). Saat tertaut → push status `connected` (#3).
   - `send` → kirim WA: `payload = {to, body}` dari `sessionId`.
   - `logout` → putus sesi.
   - **Ack**: `POST /api/wa/gateway/outbox {ackIds:[...]}` setelah diproses.
2. **Push QR** (tiap QR refresh ~20 dtk) → `POST /api/wa/gateway/qr {sessionId, qr}`
3. **Push status** → `POST /api/wa/gateway/status {sessionId, status, waNumber}`
   - status: `qr | connected | disconnected`
4. **Push pesan masuk** → `POST /api/wa/gateway/inbound {sessionId, from, body, name?}`
   - Vercel catat percakapan (ter-assign ke rep pemilik sesi) + (kalau `WA_AUTO_REPLY=1`) draft balasan AI → masuk antrian `send`.

## Sisi browser (sudah jadi)
- `POST /api/wa/session` (connect) · `GET /api/wa/session` (poll status+QR) · `DELETE` (disconnect).
- UI: *Pengaturan → Extension* → kartu **WhatsApp** (render QR + polling).

## Atribusi
Pesan/lead dari sesi `rep:<userId>` otomatis **assigned_to = userId** → masuk
**Monitoring Sales** + isolasi per-rep (doc 41). Session resmi = sumber kebenaran;
gateway cuma transport.

## Persistensi & anti-ban
Gateway simpan **auth state** per sesi (Baileys creds) → reconnect tanpa QR ulang.
Rate-limit kirim + jeda manusiawi + cuma kontak opt-in (risiko ban WA-Web).

## Env
- Vercel: `WA_GATEWAY_TOKEN` (wajib), `WA_AUTO_REPLY=1` (opsional, auto-balas AI).
- Gateway VPS: `WA_GATEWAY_TOKEN` (sama), `VERCEL_BASE_URL` (URL app), poll interval.
