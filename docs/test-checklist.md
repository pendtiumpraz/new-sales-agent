# Test Checklist — Closing-Flow AI + Admin (sesi ini)

Centang sambil nguji. Banyak fitur **DB-backed** → butuh DB live. Yang nggak butuh
DB ditandai **(mock-OK)**.

## 0. Persiapan

- [ ] Kill dev server lama, jalanin: `npm run dev` (port 3100). Demo cepat? `npm run preview`.
- [ ] `.env.local` untuk fitur penuh:
  - `DATABASE_URL=...` (Neon) + `npm run db:push` (skema). **Catatan:** semua fitur baru sesi ini **zero-migration** (pakai `platform_setting` key/value) — nggak ada kolom baru.
  - `NEXT_PUBLIC_AI_PROVIDER=deepseek` + `DEEPSEEK_API_KEY=...` → AI beneran. Tanpa ini → fallback heuristik/mock.
  - WA: `WA_AUTO_REPLY=1`, `WA_GATEWAY_TOKEN=rahasia123`.
- [ ] Seed DB: `npm run db:seed` (users/convos) → `npm run db:seed-ai` (model AI) → **`npm run db:seed-wa`** (tenant `t_default` aktif + membership demo + `wa_session rep:u_rep`).
- [ ] Login (`/login`) pakai akun demo, mis. `superadmin@mairasales.com` / `super1234` (superadmin), atau akun rep buat tes scoping.

---

## 1. Smoke test (mock-OK)
- [ ] Semua halaman sidebar kebuka tanpa error (Beranda, Lead, Inbox, Pipeline, Workspace, Settings, Field, Konten, Retensi).
- [ ] Tidak ada hero gradient dobel di Retensi; tabel-tabel pakai DataTable konsisten.

## 2. Field role-scoping (mock-OK)
- [ ] Login **Superadmin/Manager** → `/field` tampil **semua** rep (Jakarta+Surabaya); `/field/visits` semua kunjungan.
- [ ] Login **Sales Rep** (`teguh@mairasales.com` / `teguh1234`) → `/field` cuma rep miliknya (fr_0001/0002); header bilang "aktivitas lapangan Anda"; `/field/visits` cuma kunjungan rep itu.
- [ ] `/field/visits`: search + sort kolom + empty state jalan.

## 3. Member enable/disable (DB)
- [ ] Settings → Tim & Akses → tombol **UserX/UserCheck** per member → badge "Nonaktif" + avatar redup; toggle balik aktif.

## 4. Market-Fit Analyzer
- [ ] **(mock-OK)** Standalone: `POST /api/market-fit` (lihat curl di §9) → `marketType` + ICP + segmentFit + allowedTechniques.
- [ ] **(DB)** Workspace hub `/workspaces/[id]` → panel **Setup**: produk ke-detect → klik **Analisis** → muncul band B2B/B2C + ICP + bar fit segmen + chip teknik (B2B tanpa teknik agresif). Reload → tersimpan. "Lanjut ke Discovery" kebuka.

## 5. Sales Play editor (DB)
- [ ] Workspace hub → expand **Sales Play** → edit value ladder / worth-of-cost / bridge harga / topik dilarang / handoff keywords → **Simpan** → reload → kebawa.
- [ ] Tambah **Materi per tahap** (stage + kind + label + URL) → muncul di list → Simpan → kebawa; remove jalan.

## 6. Humanizer chat in-app (mock-OK)
- [ ] Buka **Asisten Sales** → tanya sesuatu → balasan keluar **multi-bubble** (pop satu-satu) + pembuka "hmm…", ada jeda "mengetik". **Tanpa markdown** (`###`, `**`).

## 7. Predictive readiness (mock-OK utk badge)
- [ ] Inbox → buka percakapan mana aja → header thread tampil badge **"NN% · Dingin/Hangat/Panas"**; hover → NBA + factors.
- [ ] **(DB)** `GET /api/sales/readiness?conversationId=...` balikin skor (utk convo WA yg udah diproses).

## 8. Admin lifecycle (DB, login superadmin)
- [ ] `/admin` → **User Management** → **Buat akun**:
  - [ ] Mode "Tenant baru + owner": isi perusahaan/paket/nama/email/sandi → Buat → muncul di list.
  - [ ] Mode "Tambah ke tenant": pilih tenant + peran → Buat.
  - [ ] Email dobel → error "sudah terdaftar".
- [ ] **Undang + accept-invite:**
  - [ ] (owner/admin) Settings → Tim → undang email + peran → muncul "Pending" → **Salin link**.
  - [ ] Buka link `/invite/<token>` (incognito) → tampil "diundang ke <Tenant> sebagai <role>" → isi nama+sandi → Gabung → sukses.
  - [ ] Login pakai email+sandi itu → masuk. Buka link lagi → "sudah dipakai".

---

## 9. Simulasi WhatsApp loop (DB + token) — inti closing-flow

> Belum ada gateway beneran → simulasi via curl. Jalankan **`npm run db:seed-wa`** dulu
> (bikin tenant `t_default` aktif + `wa_session rep:u_rep`). Ganti `TOKEN`/`FROM` kalau perlu.
> Untuk balasan AI beneran (bukan holding), pastikan `db:seed-ai` + ada model aktif untuk tenant.

```bash
TOKEN=rahasia123 ; SID="rep:u_rep" ; FROM="628123456789"

# (a) Lead nanya harga DULUAN — harusnya AI BRIDGE, bukan kasih angka
curl -s -X POST localhost:3100/api/wa/gateway/inbound \
 -H "x-wa-gateway-token: $TOKEN" -H "Content-Type: application/json" \
 -d "{\"sessionId\":\"$SID\",\"from\":\"$FROM\",\"body\":\"kak ini harganya berapa?\",\"name\":\"Budi\"}"

# (b) Lihat job kirim yang di-enqueue (bubble + delayMs + typing + seq)
curl -s "localhost:3100/api/wa/gateway/outbox?sessionId=$SID" -H "x-wa-gateway-token: $TOKEN"
```

- [ ] **(a)** balikin `{ ok:true, replied:true }` (mode auto).
- [ ] **(b)** outbox berisi beberapa job `send` urut `seq`, tiap punya `delayMs`+`typing`; isinya **nge-bridge** ("biar pas, boleh cerita kebutuhannya…"), **bukan angka harga**.
- [ ] Kirim lagi pesan yang nyebut kebutuhan + minat (mis. "follow up lead-ku sering bocor, mau yang bisa otomatis") beberapa kali → tahap maju (discovery→value), baru harga boleh keluar setelah value.

**Guardrails:**
- [ ] **Topic guard:** body `"gimana politik pemilu?"` → balasan **deflect** humanis, bukan jawab politik.
- [ ] **Handoff:** body `"mau komplain, kecewa banget"` → bubble **holding** ("bentar ya, aku cek…") + convo unread (rep ambil alih), `replied:false`.
- [ ] **Rate-limit:** spam ~> 40 balasan/jam ke 1 nomor → berhenti auto-reply (cek outbox nggak nambah), convo unread. (atau set `WA_RL_LEAD_HOURLY=3` buat tes cepat).
- [ ] **Graceful $0:** matiin AI (hapus `DEEPSEEK_API_KEY`) atau habisin kredit → balasan jadi **holding + handoff**, BUKAN error.

**Market-fit → teknik (opsional):** set `wa_default_workspace:<tenantId>` = id workspace yg udah B2B → di tahap closing, teknik yang muncul konsultatif (tanpa Pura-pura Bego dll).

**Semi-auto gate:**
- [ ] Inbox header → toggle ke **Semi-auto** (owner/admin).
- [ ] Kirim inbound (curl a) → **outbox KOSONG** (nggak auto-kirim); buka thread di Inbox → **kartu "Draf AI menunggu persetujuan"** muncul.
- [ ] **Setujui & kirim** → cek outbox terisi bubble; kartu hilang. Atau **Buang** → kartu hilang, outbox tetap kosong.

---

## 10. Catatan jujur
- Fitur DB (WA loop, admin, market-fit persist, sales play, readiness, draft, rate-limit) **mati di mode mock murni** → fallback/no-op. Wajib DB live.
- AI beneran butuh `deepseek` + key; tanpa itu balasan WA = template/holding, market-fit = heuristik.
- Deteksi tahap & skor = **heuristik** (engine real, bukan model terlatih).
- Gateway WA + extension = **project terpisah** — kontrak di `docs/wa-gateway-contract.md`; di sini disimulasikan via curl.
