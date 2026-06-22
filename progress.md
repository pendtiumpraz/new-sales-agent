# Maira Sales — Progress & Improvement Plan

> Living tracker. Centang `[x]` kalau selesai. Tujuan besar: **AI sales konsultatif,
> value-first, yang meng-enforce metodologi closing teruji** (bukan menjanjikan angka
> 30–50% — angka itu dibatasi PMF × kualitas lead × harga; AI menaikkan **lantai
> eksekusi**, konsisten 24 jam).

**Legenda:** ✅ selesai · 🟡 sebagian · ⬜ belum · ⏸️ ditunda (keputusan user)

---

## 0. Status singkat

| Area | Status |
|---|---|
| Redesign UX (cluster 01–08) | ✅ |
| Field role-scoping (`ownerUserId`) | ✅ |
| Member enable/disable (seat) | ✅ |
| Chat context summarization (hemat token) | ✅ |
| **Closing-Flow AI (visi utama)** | ✅ end-to-end (sisa: predictive training loop + extension terpisah) |
| Market-Fit Analyzer (B2B/B2C) | ✅ engine + API + UI stepper + persist |
| Sales Play config per-workspace | ✅ schema + persist + editor + wired ke orchestrator |
| 17 Teknik Closing → KB | ✅ seed + wired ke prompt |
| Superadmin create user+tenant | ✅ |
| Invite-acceptance (sales rep bisa login) | ✅ |
| Invite-acceptance flow | ⏸️ |

---

## 1. Sudah selesai (sesi ini)

| Item | Commit |
|---|---|
| EnrichmentTable → shared DataTable + trim settings index | `771867b` |
| Cluster 07 — use-case sticky jump-nav | `888cf56` |
| Cluster 06 — Field (Lapangan) di-migrasi ke shared system | `aeccfe1` |
| Cluster 06 — buang hero dekoratif Retensi (anti duplikat KPI) | `b925e07` |
| Field role-scoping roster + visits via `FieldRep.ownerUserId` | `1d89ae2` |
| Member enable/disable seat (tanpa hapus) | `46050b5` |
| Chat context: summary vs full, kirim yang lebih ringkas | `cdeb156` |
| Humanizer engine (`lib/ai/humanizer.ts`) + in-app multi-bubble playback (`HumanizedMessage`) di chat assistant | sesi ini |
| WA server-emit: orchestrator (`lib/wa/orchestrator.ts`) humanize → enqueue paced bubbles (`delayMs`+`typing`) + topic guard + holding/handoff + reply-only allowlist | sesi ini |
| Phase 1 pondasi: `KbClosingTechnique` + seed 17 teknik (`lib/kb/closing-techniques.ts`) wired ke KB prompt + WA orchestrator; `SalesPlay` schema + `defaultSalesPlay()` | sesi ini |
| Phase 2: Market-Fit Analyzer engine (`lib/market-fit/analyzer.ts`, AI + heuristik) + `POST /api/market-fit` → B2B/B2C/mix + ICP + skor segmen + allowed closing techniques | sesi ini |
| Phase 2 tail: stepper UI di workspace hub (`MarketFitPanel`) + persist per-workspace (`/api/workspaces/[id]/market-fit`, zero-migration via `platformSettingTable`) | sesi ini |
| Phase 3 deepening: conversation state-machine (`lib/sales/stage-machine.ts` + `stage-store.ts`) — stage tracking + priceGate + NBA + technique-at-closing; WA orchestrator + inbound route jadi stage-aware | sesi ini |
| Wire `marketType` ke WA: inbound resolve dari `conversation.workspaceId` / `wa_default_workspace:<tenantId>` → `loadMarketFit` → filter teknik B2B/B2C di chat live | sesi ini |
| Gateway contract siap extension: `pollOutbox` FIFO + filter `?sessionId=` (per-rep), outbox poll/ack + inbound webhook didokumentasikan di `docs/wa-gateway-contract.md` | sesi ini |
| C3 rate-limit (`lib/wa/rate-limit.ts`): per-lead/jam + per-tenant/hari → over cap = stop auto-reply + unread untuk human (anti-iseng, cost cap) | sesi ini |
| Phase 4 predictive: closing-readiness 0–100 + band + NBA (`lib/sales/predictive.ts`) dari sinyal stage-machine; persist + `GET /api/sales/readiness`; di-compute tiap inbound | sesi ini |
| Badge readiness di inbox (`components/inbox/readiness-badge.tsx`): header thread tampil skor + band, dihitung dari message history pakai engine yang sama (jujur, no dummy) | sesi ini |
| Phase 5 U3: superadmin create user+tenant (`createAdminUser` + `POST /api/admin/users` + dialog "Buat akun") | sesi ini |
| Phase 5 U1: accept-invite (`/api/invites/[token]` + `/invite/[token]` page + "Salin link" di Tim) → rep diundang bisa login | sesi ini |
| Phase 1 tail: SalesPlay persist (`/api/workspaces/[id]/sales-play`) + editor `SalesPlayPanel` + wired ke WA orchestrator (priceGate bridge/value ladder/worth-of-cost/adab/handoff beneran ngefek) | sesi ini |
| Phase 4 G6: `StageMaterial` (banner/video/studi-kasus per tahap) di SalesPlay + editor + orchestrator nawarin materi di tahap cocok | sesi ini |
| Semi-auto gate: mode auto/semi (`/api/wa/mode`), draft store + `/api/wa/draft` approve/discard, `WaDraftCard` di thread + `WaModeToggle` di inbox | sesi ini |
| C1 cap output chat in-app (`meteredStreamText` maxOutputTokens) + C6 rate-limit per-plan + override (`wa_rl:<id>`) | sesi ini |
| UX simplification: Workspace jadi landing default (login+pending), sidebar 3-grup, `/contacts` jadi funnel ke workspace, inbox 4-filter | sesi ini |
| UX simplification lanjut: "Fitur lain" jadi collapsible (default tutup, urut funnel, badge jumlah) → harian cuma 7 item kelihatan; fix link profil Inbox basi (`/contacts?view=inbox` → `/inbox`) | sesi ini |
| **Transport WAHA**: adapter inbound (`/api/wa/waha/inbound` normalize webhook → orchestrator existing) + bridge outbound dependency-free (`gateway/waha/bridge.mjs`, honor delayMs+typing → WAHA sendText) + docker-compose (NOWEB) + `docs/wa-gateway-waha.md` | sesi ini |

Semua sudah push ke `pendtiumpraz/main` + `origin/new-main`, tsc + lint hijau tiap langkah.

---

## 2. Gap analysis

### 2A. Closing-Flow AI — visi utama (yang paling besar)

Target: AI jalanin obrolan sales konsultatif. Knowledge · adab · alur closing · bahan ·
QnA · descriptive · konsultatif · prediktif. **1 workspace = 1 produk.**

| ID | Gap | Kondisi sekarang |
|---|---|---|
| **G1** | **Sales Play config per-workspace** — stages, `adabPolicy`, `priceGate`, `worthOfCost`, `valueLadder`, `handoffRules` | ⬜ belum ada struktur datanya |
| **G2** | **Conversation orchestrator / state-machine** — tahu di tahap closing mana + next-best-action; **closing di AKHIR** | ⬜ sekarang chat free-form, bukan flow |
| **G3** | **Market-Fit Analyzer (B2B/B2C)** sebagai tahap-2 workspace — klasifikasi + ICP + skor segmen | 🟡 ada fit-score di enrichment, belum jadi langkah eksplisit |
| **G4** | **17 Teknik Closing → KB** (tipe `KbClosingTechnique` + seed + wiring prompt) | ⬜ |
| **G5** | **Adab / conversation-policy** — 1 ide / bubble, no harga di awal, close-question, value-before-price | ⬜ belum di-enforce sebagai constraint output |
| **G6** | **Bahan per-tahap** — aset (banner, video ≤1mnt/10MB, studi kasus) ke-link ke tahap closing | 🟡 modul Content ada, belum ke-link tahap |
| **G7** | **Prediktif** — skor closing-readiness + next-best-action + kapan handoff | 🟡 ada `temperature`/score, belum jadi NBA |
| **G8** | **Setup-flow terpandu** — urutan Produk → Market-Fit → Discovery dipaksa berurutan | ⬜ |

**Prinsip yang harus baked-in (non-negotiable):**
- **Value sebelum harga.** Harga = pembanding vs vendor; value = alasan beli. `priceGate`
  nutup harga sampai (need teridentifikasi && value tersampaikan).
- **Worth of cost.** Bangun "biaya masalah" dulu → harga kebaca lebih kecil dari masalahnya.
- **Humanis.** Mirror bahasa lead, bubble pendek, close-question, jangan robotik.
- **Handoff guardrail.** AI conduct rapport→value→objection ringan; **handoff ke manusia
  di momen closing/negosiasi/sensitif** (AI maksa closing sendiri = bikin ilfeel).

### 2B. User / Tenant management — grain **TENANT** (sudah diputuskan)

| ID | Gap | Status |
|---|---|---|
| **U1** | Invite-acceptance flow — sales rep yang diundang bisa login | ✅ `/api/invites/[token]` + `/invite/[token]` |
| **U2** | Enable/disable seat per-member (tanpa hapus) | ✅ `46050b5` |
| **U3** | Superadmin create user+tenant langsung (tanpa self-register) | ✅ `POST /api/admin/users` |

**Yang SUDAH ada (di grain tenant, jangan dibikin ulang):** register (tenant `pending`) ·
superadmin activate/deactivate (`suspend`/`activate`) · durasi aktivasi (`activate_until`) ·
quota token (`grant_credit`) · invite/role-change/remove member.

### 2C. Keputusan arsitektur (tercatat)

- **Grain aktivasi/durasi/quota = TENANT** (akun), bukan per-user. Standar SaaS.
- **Discovery sourcing:** SERP publik volume-tinggi → **server-side SERP API** (SerpApi /
  DataForSEO) — extension **tidak** dipakai buat Google (1 IP rep → kena CAPTCHA + ngerusak
  IP pribadi rep). Extension **tetap** buat enrich di balik login (LinkedIn/IG).
- **Mandat AI diperluas** dari "recommend + filter" → "menjalankan obrolan closing", **dengan
  pagar handoff** di momen closing.

### 2D. Cost control & guardrails (anti-abuse, biar token aman)

| ID | Gap | Status |
|---|---|---|
| **C1** | Cap output per balasan (maks token) → balasan pendek = humanis + murah | ✅ WA 220 + chat in-app (`meteredStreamText` maxOutputTokens, reasoning floored) |
| **C2** | Input dipangkas (running summary) | ✅ `cdeb156` |
| **C3** | Rate-limit per-lead & per-tenant (anti iseng / spam request panjang) | ✅ `lib/wa/rate-limit.ts` |
| **C4** | Topic guard — no politik/SARA/di luar produk → deflect humanis | ⬜ |
| **C5** | Graceful degradation saat limit/credit $0 → **holding humanis + handoff**, JANGAN tampil error/"token habis" | ⬜ |
| **C6** | Limit per-plan (starter/growth/enterprise) + override env / per-tenant (`wa_rl:<id>`) | ✅ `lib/wa/rate-limit.ts` |

Sudah ada: tenant credit/metering, `creditEnforced`+`tenantCreditBalance` ($0 → AI blocked), mock fallback (`composeKbReply`), handoff queue.

### 2E. Pipeline end-to-end & transport eksekusi

Alur per workspace:
1. **Tentukan produk** (1 ws = 1 produk)
2. **Market-Fit Analyzer** → B2C/B2B + ICP
3. **Discovery** → cari kontak (extension)
4. **Generate Sales Script** = rules `docs/sales-script-humanis.md` × produk × hasil market-fit
5. **Pilih kontak → queue → eksekusi** via extension; balas **hanya nomor di allowlist backend**

Transport (keputusan + caveat):
- **WhatsApp = extension RPA** jalanin WhatsApp Web di session/nomor rep — kirim, baca history, POST ke backend; **hanya act pada allowlist + queue dari backend**. Loop: inbound → extension baca → backend orchestrator generate bubble humanis → extension kirim pakai pacing.
  - ⚠️ **RISIKO BAN**: WA melarang automation. Mitigasi: **reply-only** (jauh lebih aman dari cold-blast), pacing manusiawi (humanizer), volume rendah, nomor warm, semi-auto (draft→approve). Skala besar/cold → pertimbangkan **WA Cloud API resmi** (aman ban, tapi verifikasi + template + window 24 jam + biaya per pesan).
  - **Extension VS server-gateway (Baileys/open-wa)** (keputusan 2026: condong EXTENSION): extension = Chrome asli + session + IP rep → **fingerprint paling manusiawi** (deteksi lebih rendah dari Baileys/open-wa yg headless di datacenter). TAPI: (a) **bukan 24/7** — cuma jalan saat browser rep kebuka; (b) **tetap langgar ToS** — per **15 Jan 2026 WA eksplisit larang AI chatbot pihak-3**, ban kena **nomor pribadi rep**; (c) backend kita **gateway-agnostic** → extension tinggal jadi transport (poll outbox + push inbound), otak (orchestrator/humanizer/stage-machine/guardrail) nggak berubah.
- **Email = server-side** (SMTP/OAuth/ESP yang udah ada di `/settings/mailboxes`) — **NGGAK butuh extension**. Deliverability lebih baik, no ban issue.
- **Satu extension modular** (content-script per host: linkedin/ig/marketplace utk discovery, web.whatsapp.com utk kirim/baca) **>** dua extension terpisah (install friction + auth dobel).

---

## 3. Rencana per fase

### Phase 0 — Foundations ✅
- [x] Redesign cluster 01–08 + follow-ups
- [x] Field role-scoping (`ownerUserId`)
- [x] Member enable/disable seat
- [x] Chat context summarization (hemat token)

### Phase 1 — Knowledge & Sales Play config  ✅
> Rumah data buat semua perilaku AI. Low-risk (nambah tipe + seed), belum ubah runtime.
- [x] **(G4)** Tipe `KbClosingTechnique` di `lib/types/kb.ts` — `{ id, nama, inti, contohSkrip, cocokUntuk, sinyalPemicu }` (field **opsional** di `KnowledgeBase`)
- [x] **(G4)** Seed **17 Teknik Closing** (Dewa Eka Prayoga) → `lib/kb/closing-techniques.ts` (`CLOSING_TECHNIQUES_17` + `formatClosingTechniques` filter B2B/B2C)
- [x] **(G4)** Wiring 17 teknik ke `buildKbSystemPrompt` (surface sales, "pakai di tahap akhir") + WA orchestrator
- [x] **(G1)** Skema `SalesPlay` (`lib/types/sales-play.ts`): `stages[]`, `adab`, `priceGate`, `worthOfCost`, `valueLadder`, `handoff`, `closingTechniqueIds` + `defaultSalesPlay()`
- [x] **(G1)** Persist SalesPlay per-workspace (`/api/workspaces/[id]/sales-play`, zero-migration) + **editor** `SalesPlayPanel` di hub (priceGate bridge, value ladder, worth-of-cost, adab, handoff) + **wired ke orchestrator** (editan beneran ngefek: forbiddenTopics, handoff keywords, earlyPriceBridge, valueLadder/anchors, maxSentences, filler)
- **Acceptance:** ✅ KB 17 teknik + skema SalesPlay + persist + editor + orchestrator baca SalesPlay per-workspace.

### Phase 2 — Market-Fit Analyzer (B2B/B2C)  ✅
- [x] **(G3)** Analyzer (`lib/market-fit/analyzer.ts`) baca produk+segmen → `{ marketType: B2B|B2C|mix, confidence, icp, segmentFit[] }`. AI path + heuristik fallback (never throws).
- [x] **(G3)** `POST /api/market-fit` — AI saat login, heuristik saat demo (tetap demoable)
- [x] **(link)** Klasifikasi nyetir teknik closing — route balikin `allowedTechniques` (B2C agresif OK; B2B konsultatif via `cocokUntuk` filter)
- [x] **(G3)** Persist hasil per-workspace (`/api/workspaces/[id]/market-fit` GET/POST, store via `platformSettingTable` — zero-migration) → input untuk Discovery
- [x] **(G8)** Stepper Produk → Market-Fit → Discovery di workspace hub (`MarketFitPanel`): jalanin analyzer, tampil marketType + ICP + fit segmen + teknik yang cocok; Discovery kebuka setelah market-fit
- **Acceptance:** ✅ buka workspace → panel setup; Analisis → B2B/B2C + ICP + teknik; hasil tersimpan & ke-load lagi; Discovery unlock.

### Phase 3 — Conversation Orchestrator (closing di akhir)  ✅
- [x] **(G2)** State-machine (`lib/sales/stage-machine.ts`): rapport→discovery→value→objection→closing — deteksi sinyal (need/value/price/objection/closing) + `pickStage` + persist per-conversation (`convstage:<id>`). Dipakai WA orchestrator tiap inbound.
- [x] **(G5)** Adab enforced di prompt: 1-2 kalimat/bubble (via `humanize`), close-question, no-markdown, no-early-price (priceGate)
- [x] **(G5-humanis) engine + in-app**: `humanize()` → array bubble `[{ kind, text, delayMs }]` (1 ide/bubble, strip markdown, filler hemat, delay ~ panjang teks); `HumanizedMessage` mainin bubble satu-satu + typing pip di chat assistant. Tetap **1 LLM call** (client yang pacing → nggak nambah biaya AI)
- [x] **(G5-humanis) WA**: orchestrator (`lib/wa/orchestrator.ts`) emit array bubble server-side → inbound route enqueue 1 job/bubble dgn `delayMs`+`typing` (reply-only via `waReplyAllowed`). Gateway VPS tinggal honor pacing saat kirim.
- [x] **(G1/value)** `priceGate` aktif — `decide()` buka harga HANYA setelah need+value; ditanya duluan → bridge ke kebutuhan (di guidance prompt)
- [x] **(G4)** Teknik closing **cuma muncul di tahap CLOSING** + difilter market (B2B drop teknik agresif)
- [x] **(guardrail)** Handoff: sinyal komplain/nego (regex) ATAU AI gagal/credit 0 → holding + handoff
- [x] **Semi-auto gate**: mode `wa_reply_mode:<tenantId>` = semi → balasan ditahan jadi draf (`wadraft:<convId>`), rep approve/discard di inbox (`WaDraftCard`), toggle Auto/Semi di header inbox (`WaModeToggle`). Approve → enqueue paced bubbles. Default tetap auto.
- [x] **(C1)** Cap output: WA `maxOutputTokens` 220 + chat in-app (`meteredStreamText`, reasoning model di-floor 1200 biar nggak empty)
- [x] **(C4)** Topic guard: politik/SARA/judi → deflect humanis — **WA orchestrator** (`OFF_TOPIC`, no AI spend)
- [x] **(C3)** Rate-limit: per-lead/jam + per-tenant/hari (`lib/wa/rate-limit.ts`, hitung outbound `messagesTable`) → over cap = STOP auto-reply + biarkan unread buat human (env: `WA_RL_LEAD_HOURLY`/`WA_RL_TENANT_DAILY`)
- [x] **(C5)** Graceful degradation: AI gagal/credit 0 → holding humanis + handoff (bukan error) — **WA orchestrator**
- [x] **(C6)** Rate-limit **per-plan** (starter/growth/enterprise) + override env / per-tenant setting `wa_rl:<id>="lead,daily"`. Hard cap tetap credit ($0 → graceful holding).
- **Acceptance:** simulasi obrolan: lead nanya harga di awal → AI bridge ke value, harga keluar setelah value, teknik closing muncul di akhir; lead spam/iseng → ke-rate-limit + tetap humanis; credit $0 → holding + handoff, bukan error.

### Phase 4 — Materials + Predictive  🟡  *(predictive jalan)*
- [x] **(G6)** Materi per-tahap (`StageMaterial` di SalesPlay) — editor di `SalesPlayPanel`; orchestrator nawarin materi (kirim LINK) di tahap yang cocok, bukan teks panjang
- [x] **(G7)** Skor closing-readiness 0–100 + band (dingin/hangat/panas) + NBA (`lib/sales/predictive.ts`) dari sinyal stage-machine; persist per-conversation (`convscore:<id>`); `GET /api/sales/readiness`. **Jujur: heuristik, belum model terlatih.**
- [ ] **(G7)** Loop data: simpan outcome obrolan buat naikin akurasi prediktif (sekarang simpan skor terakhir, belum training loop)
- **Acceptance:** AI nyaranin aset per tahap + skor "siap closing?" per percakapan.

### Phase 5 — Admin / Tenant gaps  ✅
- [x] **(U3)** Superadmin create user+tenant — `createAdminUser` + `POST /api/admin/users` + dialog "Buat akun" (mode tenant-baru / tambah-ke-tenant) di UserManagement
- [x] **(U1)** Invite-acceptance — `GET/POST /api/invites/[token]` + halaman publik `/invite/[token]` (set nama+sandi → user+membership aktif, invite `accepted`); tombol "Salin link" di Tim
- **Acceptance:** ✅ superadmin provision akun tanpa self-register; ✅ rep yang diundang bisa terima → login.

### Phase 6 — Transport gateways (eksekusi WA)  🟡
> Backend gateway-agnostic (`docs/wa-gateway-contract.md`). Otak tetap di server;
> transport tinggal poll outbox + push inbound. Dua implementasi kontrak yang sama.
- [x] **WAHA adapter** (server-gateway, gratis+open-source): route inbound `/api/wa/waha/inbound` (normalize webhook WAHA → forward ke `/api/wa/gateway/inbound`, drop fromMe/grup/broadcast) + `gateway/waha/bridge.mjs` (poll outbox → startTyping → delayMs → sendText → stopTyping → ack) + docker-compose (NOWEB) + `.env.example` + `docs/wa-gateway-waha.md`. Zero refactor route lama.
- [x] **Chrome extension (MV3)** — transport yang sama, fingerprint paling manusiawi (browser+IP rep). `gateway/extension/`: background SW = sisi network (CSP-safe), content-script `web.whatsapp.com` = loop+DOM (inbound observe via `data-id`, outbound openChat→type→Enter honor delayMs+typing), popup on/off+tes koneksi, options (backend/token/session/poll), selector dipusatin di `SEL` + `docs/wa-extension.md`. Caveat jujur: DOM WA Web rapuh (execCommand insertText + Enter), bukan 24/7.
- [x] **Discovery adapter (LinkedIn/IG)** di extension yang sama (modular, 1 install): `discovery.js` ekstrak profil di balik login (selector dipusatin di `EXTRACTORS`) → tombol floating "Simpan ke Maira" → `POST /api/ingest` (`x-ingest-token` per-rep → auto-assign, `origin:"extension"`, `workspaceId`). Options nambah ingest-token + workspace tujuan. `docs/extension-discovery.md`. Sesuai arsitektur RPA-extract + AI-recommend. Caveat: ToS LinkedIn/IG, manual click (bukan bulk crawl — itu jalur SERP server-side).
- [x] **In-extension AI classify (DeepSeek, metered)**: tombol "Analisa" → `POST /api/discovery/classify` reuse `classifyLead` (metered `meteredGenerateText`, key server-only, untrusted-wrapped, grounded ke produk workspace) → tampil badge B2B/B2C + skor + reason; "Simpan" nempelin hasil ke ingest (server skip fallback classify). **Keputusan biaya:** classify di backend metered, BUKAN client-side key (biar gak bypass C1–C6 + gak bocorin key). Pure-mock → heuristik.
- **Caveat (jujur):** dua-duanya tetap WA Web automation → langgar ToS (Jan 2026 larang AI-bot). Server-gateway (WAHA) lebih kedeteksi dari extension; extension bukan 24/7. Skala/aman-ban → WA Cloud API resmi.
- **Acceptance:** inbound WA nyata → orchestrator balas bubble paced via gateway; `WA_AUTO_REPLY=1` + allowlist dihormati.

---

## 4. Backlog / ditunda
- Role-scoping data model lanjutan (di luar Field).
- Workspace "Buka & fokus" → set active scope + ganti chip TopBar (belum diwire).
- Generate aset (video 1mnt) otomatis — sekarang AI cuma **milih** aset, bikin = tim konten.

---

## 5. Catatan teknis (jujur)
- Fitur DB-gated (member disable, chat-summary metered, register, admin) **hanya jalan dengan
  DB + model AI live**. Mode mock murni → no-op/fallback. Konsisten dgn arsitektur existing.
- Chat-summary aktif saat: login + DB + transcript > ~600 token. Di bawah itu kirim full.
- **30–50% bukan jaminan.** Yang dibangun: enforcement metodologi yang konsisten. Angka final
  = PMF × kualitas lead × harga. Jangan dijual sebagai garansi.

---

_Update terakhir: ditulis bareng implementasi sesi ini. Tiap fase selesai → centang + catat commit._
