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
| **Closing-Flow AI (visi utama)** | ⬜ baru pondasi data |
| Market-Fit Analyzer (B2B/B2C) | 🟡 engine + API (UI/persist pending) |
| Sales Play config per-workspace | 🟡 schema + default (UI/persist pending) |
| 17 Teknik Closing → KB | ✅ seed + wired ke prompt |
| Superadmin create user+tenant | ⏸️ pending |
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
| **U1** | Invite-acceptance flow — sales rep yang diundang **belum bisa login** (status stuck `pending`) | ⏸️ |
| **U2** | Enable/disable seat per-member (tanpa hapus) | ✅ `46050b5` |
| **U3** | Superadmin create user+tenant langsung (tanpa self-register) | ⏸️ pending |

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
| **C1** | Cap output per balasan (maks token) → balasan pendek = humanis + murah | 🟡 `maxOutputTokens` ada di meter, belum diketatin utk chat sales |
| **C2** | Input dipangkas (running summary) | ✅ `cdeb156` |
| **C3** | Rate-limit per-lead & per-tenant (anti iseng / spam request panjang) | ⬜ |
| **C4** | Topic guard — no politik/SARA/di luar produk → deflect humanis | ⬜ |
| **C5** | Graceful degradation saat limit/credit $0 → **holding humanis + handoff**, JANGAN tampil error/"token habis" | ⬜ |
| **C6** | Limit **diturunkan dari budget** (balasan ≈ credit ÷ token_per_reply), config per-tenant/plan | ⬜ |

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
- **Email = server-side** (SMTP/OAuth/ESP yang udah ada di `/settings/mailboxes`) — **NGGAK butuh extension**. Deliverability lebih baik, no ban issue.
- **Satu extension modular** (content-script per host: linkedin/ig/marketplace utk discovery, web.whatsapp.com utk kirim/baca) **>** dua extension terpisah (install friction + auth dobel).

---

## 3. Rencana per fase

### Phase 0 — Foundations ✅
- [x] Redesign cluster 01–08 + follow-ups
- [x] Field role-scoping (`ownerUserId`)
- [x] Member enable/disable seat
- [x] Chat context summarization (hemat token)

### Phase 1 — Knowledge & Sales Play config  🟡  *(schema + seed selesai)*
> Rumah data buat semua perilaku AI. Low-risk (nambah tipe + seed), belum ubah runtime.
- [x] **(G4)** Tipe `KbClosingTechnique` di `lib/types/kb.ts` — `{ id, nama, inti, contohSkrip, cocokUntuk, sinyalPemicu }` (field **opsional** di `KnowledgeBase`)
- [x] **(G4)** Seed **17 Teknik Closing** (Dewa Eka Prayoga) → `lib/kb/closing-techniques.ts` (`CLOSING_TECHNIQUES_17` + `formatClosingTechniques` filter B2B/B2C)
- [x] **(G4)** Wiring 17 teknik ke `buildKbSystemPrompt` (surface sales, "pakai di tahap akhir") + WA orchestrator
- [x] **(G1)** Skema `SalesPlay` (`lib/types/sales-play.ts`): `stages[]`, `adab`, `priceGate`, `worthOfCost`, `valueLadder`, `handoff`, `closingTechniqueIds` + `defaultSalesPlay()`
- [ ] **(G1)** Persist SalesPlay per-workspace (DB) + UI editor (CRUD config)
- **Acceptance:** KB punya 17 teknik terstruktur ✅ + skema SalesPlay siap ✅; persist + editor masih kebuka.

### Phase 2 — Market-Fit Analyzer (B2B/B2C)  🟡  *(engine + API selesai)*
- [x] **(G3)** Analyzer (`lib/market-fit/analyzer.ts`) baca produk+segmen → `{ marketType: B2B|B2C|mix, confidence, icp, segmentFit[] }`. AI path + heuristik fallback (never throws).
- [x] **(G3)** `POST /api/market-fit` — AI saat login, heuristik saat demo (tetap demoable)
- [x] **(link)** Klasifikasi nyetir teknik closing — route balikin `allowedTechniques` (B2C agresif OK; B2B konsultatif via `cocokUntuk` filter)
- [ ] **(G3)** Persist hasil di workspace (DB) → jadi input target Discovery
- [ ] **(G8)** Paksa urutan setup: Produk → Market-Fit → Discovery (guided stepper UI)
- **Acceptance:** engine klasifikasi B2B/B2C + ICP ✅; persist ke workspace + stepper UI masih kebuka.

### Phase 3 — Conversation Orchestrator (closing di akhir)  ⬜  *(inti fitur)*
- [ ] **(G2)** State-machine: Rapport → Gali kebutuhan → Value → Objection/QnA → **Closing**
- [ ] **(G5)** Enforce adab policy sebagai constraint output (1 ide/bubble, close-question, no early-price)
- [x] **(G5-humanis) engine + in-app**: `humanize()` → array bubble `[{ kind, text, delayMs }]` (1 ide/bubble, strip markdown, filler hemat, delay ~ panjang teks); `HumanizedMessage` mainin bubble satu-satu + typing pip di chat assistant. Tetap **1 LLM call** (client yang pacing → nggak nambah biaya AI)
- [x] **(G5-humanis) WA**: orchestrator (`lib/wa/orchestrator.ts`) emit array bubble server-side → inbound route enqueue 1 job/bubble dgn `delayMs`+`typing` (reply-only via `waReplyAllowed`). Gateway VPS tinggal honor pacing saat kirim.
- [ ] **(G1/value)** `priceGate` aktif — AI nolak kasih harga sebelum need+value kepenuhan, pakai bridge/deflection
- [ ] **(G4)** Pemilihan teknik closing by sinyal lead (harga→Perbandingan/Harga-Coret; nunda→Now-or-Never; dst)
- [ ] **(guardrail)** Handoff ke manusia di tahap closing/negosiasi
- [ ] Pasang dulu di **jalur draft auto-reply** (manusia approve) sebelum auto-send
- [ ] **(C1)** Ketatin `maxOutputTokens` chat sales (balasan pendek per adab) + emoji ON
- [x] **(C4)** Topic guard: politik/SARA/judi → deflect humanis — **WA orchestrator** (`OFF_TOPIC`, no AI spend)
- [ ] **(C3)** Rate-limit: N balasan AI / lead / jam + cap harian tenant (anti iseng) — belum
- [x] **(C5)** Graceful degradation: AI gagal/credit 0 → holding humanis + handoff (bukan error) — **WA orchestrator**
- [ ] **(C6)** Hitung limit dari budget; surface di settings per-tenant/plan
- **Acceptance:** simulasi obrolan: lead nanya harga di awal → AI bridge ke value, harga keluar setelah value, teknik closing muncul di akhir; lead spam/iseng → ke-rate-limit + tetap humanis; credit $0 → holding + handoff, bukan error.

### Phase 4 — Materials + Predictive  ⬜
- [ ] **(G6)** Link aset Content ke tahap (sodorin banner/video di momen tepat, bukan teks panjang)
- [ ] **(G7)** Skor closing-readiness + next-best-action (awal heuristik — jujur, belum model terlatih)
- [ ] **(G7)** Loop data: simpan outcome obrolan buat naikin akurasi prediktif
- **Acceptance:** AI nyaranin aset per tahap + skor "siap closing?" per percakapan.

### Phase 5 — Admin / Tenant gaps  ⬜
- [ ] **(U3)** Superadmin create user+tenant (form di `app/admin` + `POST /api/admin/users`, mode: tenant-baru / tambah-ke-tenant)
- [ ] **(U1)** Invite-acceptance flow (route claim + halaman) → invited rep bisa login
- **Acceptance:** superadmin provision akun tanpa self-register; undangan bisa diterima.

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
