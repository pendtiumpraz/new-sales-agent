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
| Market-Fit Analyzer (B2B/B2C) | ⬜ |
| Sales Play config per-workspace | ⬜ |
| 17 Teknik Closing → KB | ⬜ |
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

---

## 3. Rencana per fase

### Phase 0 — Foundations ✅
- [x] Redesign cluster 01–08 + follow-ups
- [x] Field role-scoping (`ownerUserId`)
- [x] Member enable/disable seat
- [x] Chat context summarization (hemat token)

### Phase 1 — Knowledge & Sales Play config  ⬜  *(mulai di sini)*
> Rumah data buat semua perilaku AI. Low-risk (nambah tipe + seed), belum ubah runtime.
- [ ] **(G4)** Tipe `KbClosingTechnique` di `lib/types/kb.ts` — `{ id, nama, inti, contohSkrip, cocokUntuk: ("B2B"|"B2C")[], sinyalPemicu }` (field **opsional** di `KnowledgeBase` biar nggak mecahin existing)
- [ ] **(G4)** Seed **17 Teknik Closing** (Dewa Eka Prayoga) ke KB default
- [ ] **(G4)** Wiring 17 teknik ke `buildKbSystemPrompt` **khusus tahap closing**
- [ ] **(G1)** Skema `SalesPlay` per-workspace: `stages[]`, `adabPolicy`, `priceGate`, `worthOfCost`, `valueLadder`, `handoffRules`
- [ ] **(G1)** UI editor Sales Play di dalam workspace (CRUD config)
- **Acceptance:** KB punya 17 teknik terstruktur + tiap workspace punya 1 SalesPlay tersimpan.

### Phase 2 — Market-Fit Analyzer (B2B/B2C)  ⬜  *(depends: Phase 1 produk/segmen)*
- [ ] **(G3)** Analyzer baca produk(tahap-1)+segmen → output `{ tipe: B2B|B2C|mix, ICP, skorFitSegmen[] }`
- [ ] **(G3)** Simpan hasil di workspace; jadi input target Discovery
- [ ] **(G8)** Paksa urutan setup: Produk → Market-Fit → Discovery (guided stepper)
- [ ] **(link)** Klasifikasi B2B/B2C **nyetir bobot teknik closing** (B2C: agresif OK; B2B: konsultatif)
- **Acceptance:** buat workspace baru → wajib lewati 3 tahap; hasil market-fit nyetir Discovery.

### Phase 3 — Conversation Orchestrator (closing di akhir)  ⬜  *(inti fitur)*
- [ ] **(G2)** State-machine: Rapport → Gali kebutuhan → Value → Objection/QnA → **Closing**
- [ ] **(G5)** Enforce adab policy sebagai constraint output (1 ide/bubble, close-question, no early-price)
- [ ] **(G5-humanis)** Humanizer / super-interaktif: **multi-bubble send** (jawaban dipecah jadi beberapa pesan pendek), pacing **"sedang mengetik…" + delay ~ panjang teks**, thinking-filler ("hmm / bentar ya") **hemat & kontekstual**, variasi acak biar nggak mekanis, jangan balas instan. Channel WA (WAHA / Cloud API) dukung multi-msg + typing indicator. Output orchestrator = **array bubble** `[{ kind, text, delayMs }]`, tetap **1 LLM call** (client yang pacing → nggak nambah biaya AI)
- [ ] **(G1/value)** `priceGate` aktif — AI nolak kasih harga sebelum need+value kepenuhan, pakai bridge/deflection
- [ ] **(G4)** Pemilihan teknik closing by sinyal lead (harga→Perbandingan/Harga-Coret; nunda→Now-or-Never; dst)
- [ ] **(guardrail)** Handoff ke manusia di tahap closing/negosiasi
- [ ] Pasang dulu di **jalur draft auto-reply** (manusia approve) sebelum auto-send
- **Acceptance:** simulasi obrolan: lead nanya harga di awal → AI bridge ke value, harga keluar setelah value, teknik closing muncul di akhir.

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
