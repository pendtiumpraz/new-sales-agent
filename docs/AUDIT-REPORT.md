Both extension assets exist, so I'll downgrade that finding from a confirmed bug to "verified present." I have everything I need. Producing the report.

# Audit Fitur agentic-sales-ai — Laporan Prioritas

## 1. Ringkasan

**Hitungan fitur (8 cluster, 49 fitur):**
- **works:** 23
- **partial:** 24
- **broken:** 1 (`E-Commerce — Orders, Channel Connect & Cart Recovery`)
- **unknown:** 1 (`Stripe payment link` — tidak ada caller di cluster yang diaudit)

**Severity bug:** 7 high, ~16 medium, sisanya low.

**5 temuan terpenting:**

1. **Workspace per-kontak rusak untuk kontak DB-only.** `useContact()` membaca fixture statis (`lib/api-mock/hooks.ts:155-160`), bukan `/api/db/contacts`. Setiap kontak hasil discovery/profil (`/api/profiles/to-contact`) muncul & bisa diklik di list tapi render "Kontak tidak ditemukan" di workspace. Ini memutus alur inti list→workspace. (Verifikasi tambahan: aset extension `public/maira-extension.zip` & `public/maira-userscript.user.js` **terkonfirmasi ada**, jadi bug download yang diragukan auditor tidak berlaku.)

2. **Kebocoran data cross-tenant di Billing & Team.** `aiUsageTable`/`membershipsTable` di-query **tanpa** `WHERE tenantId` dan mengandalkan RLS yang **belum aktif** (`lib/db/tenant-context.ts:24-25`). Begitu ada tenant kedua, meter billing & daftar member bocor lintas tenant. (`app/api/tenant/billing/route.ts:28-35`, `app/api/tenant/members/route.ts:24`)

3. **Pesan tidak persisten + placeholder merge-tag pecah.** Composer inbox hanya append ke state lokal, tidak pernah `PUT /api/db/messages` (`components/inbox/message-thread.tsx:142-158`). Dan processor cadence hanya mengganti `{nama}` single-brace sedangkan builder menulis `{{nama}}` double-brace + `{{produk}}` tak pernah diganti (`lib/cadence/processor.ts:44-49`) → pesan keluar bisa berisi tag mentah.

4. **Banyak aksi "sukses" yang sebenarnya ephemeral/mock** (misleading success). Produk pipeline, konten, handoff config, e-commerce connect, retention — semuanya toast sukses tapi hilang saat reload. Ini paling merusak kepercayaan demo.

5. **Soft-delete tidak konsisten / tidak ada.** Sebagian besar entitas user-facing hard-delete tanpa konfirmasi & tanpa restore (contacts, deals, mailboxes, members), sementara workspace sudah soft-archive tapi tanpa UI restore. Tidak ada pola standar.

---

## 2. Bug kritis & broken (perbaiki dulu)

Diurut severity (high → broken cluster → medium pilihan paling berdampak).

| Fitur | Masalah | Lokasi (file:line) | Fix singkat |
|---|---|---|---|
| Unified Workspace | `useContact()` baca fixture statis, bukan DB — kontak DB-only render "tidak ditemukan", deep-link list→workspace putus | `lib/api-mock/hooks.ts:155-160` | Ganti `useContact` ke `GET /api/db/contacts` (atau buat `/api/db/contacts/[id]`) |
| Tenant billing summary | `aiUsageTable`+`membershipsTable` tanpa `WHERE tenantId`, andalkan RLS yang nonaktif → agregasi lintas tenant | `app/api/tenant/billing/route.ts:28-35` | Tambah `.where(eq(...tenantId, ctx.tenantId))`; jangan andalkan `withTenant` no-op |
| Team & Access / RBAC | GET/PATCH/DELETE members tanpa tenant scope (RLS off) → leak/mutasi member tenant lain | `app/api/tenant/members/route.ts:24`; `members/[id]/route.ts:24-25,42` | Tambah `eq(membershipsTable.tenantId, ctx.tenantId)` di semua query |
| Pipeline — Deals | PUT upsert tidak menulis `workspaceId` → kanban scoped-workspace selalu kosong setelah round-trip (silent dead-view) | `app/api/db/deals/route.ts:54-79` (filter di `kanban-board.tsx:30`) | Sertakan `workspaceId` di `.values()` & `.set()` upsert |
| Marketplace — Publish | Tidak ada dedup: tiap publish insert listing baru (`mkt_`+UUID) → marketplace banjir duplikat | `lib/marketplace/store.ts:117-130` | Unique index `(sellerTenantId, entityType, entityId)` + skip/update jika sudah listed |
| Run cadences (processor) | `fillPlaceholders` hanya ganti `{nama}` single-brace; builder pakai `{{nama}}`/`{{produk}}` → tag mentah terkirim | `lib/cadence/processor.ts:44-49` (builder `cadence-builder.tsx:67`) | Dukung `{{...}}` + handle `{{produk}}`, atau normalisasi output builder |
| Conversation thread | Composer & AutoReply approve hanya `setSent` lokal `local_${Date.now()}`, tidak persist; jalur PUT mati | `components/inbox/message-thread.tsx:142-158` | Wire send/approve ke `PUT /api/db/messages` + update `lastMessage/unread` |
| Quotes list + create | Nomor quote dari `count(*)`+update kedua → race → nomor duplikat (tak ada unique constraint) | `lib/quotes/store.ts:42-49,103-106` | Generate nomor atomik (sequence/`FOR UPDATE` counter) + unique index `(tenantId, number)` |
| KB editor | `hydrate()` set `hydrated=true` walau GET gagal → edit berikutnya PUT seed menimpa DB tenant | `lib/stores/kb-store.ts:114,147-152`; `app/(app)/layout.tsx:51` | Jangan set `hydrated=true` saat GET gagal; blok `persistKb` sampai read sukses |
| Autopilot | Dua classifier segmen+kota berbeda (page/AudiencePicker vs orchestrator) + city `includes` vs `===` → estimasi ≠ seleksi, run bisa "tidak ada prospek cocok" | `lib/autopilot/orchestrator.ts:58-77,94` vs `audience-picker.tsx:25-37,56` | Ekstrak satu classifier+filter kota bersama di `lib/`, pakai di ketiga tempat |
| AI Handoff settings | Seluruh config in-memory Zustand, tanpa API/persistence → semua perubahan hilang saat reload; "settings" tak menyimpan apa pun | `lib/stores/handoff-store.ts:2-3` | Persist ke `platform_setting`/tabel config via PUT route + load on mount |
| **E-Commerce (BROKEN)** | 100% mock: orders dari JSON, channel-connect const+useState, cart-recovery tak kirim apa pun; toast sukses menyesatkan | `lib/api-mock/hooks.ts:128-130`; `app/(app)/ecommerce/page.tsx:43-47,99-110,251-256` | Tambah tabel+`/api/db/orders` & persist connect, atau pasang banner "Mode demo" jelas |
| Stripe webhook | `upsertSubscription` select-then-insert non-atomik → dua event paralel double-INSERT kena unique index → 500 + retry | `app/api/billing/webhook/route.ts:42-69` | Pakai `onConflictDoUpdate` pada `subscription_tenant_uq` |
| Marketplace — Publish | Tidak ada UI lihat/edit/delist listing sendiri; `status='delisted'` & `store.mine()` ada tapi tak terjangkau | `app/(app)/marketplace/page.tsx:86-99` | Tab "Listing saya" via `?scope=mine` + aksi delist/restore |
| Cadence builder | DB unconfigured → PUT 200 `{ok:false, source:'mock'}` diperlakukan error, toast merah & tak navigasi (tampak rusak di demo default) | `components/cadences/cadence-builder.tsx:182-200` | Special-case `source:'mock'` (info toast + navigasi), seperti tombol run di list |
| Profiles bulk-enrich | Server cap 3 baris/klik tapi toast klaim "count dicari", tanpa indikator sisa | `app/(app)/contacts/profiles/page.tsx:296-298`; `enrich/route.ts:82-84` | Tampilkan "X dari Y selesai, klik lagi"; surface cap |
| Discovery URL crawl | Crawl sinkron > `maxDuration=60` → 504, job row baru ditulis SETELAH crawl → tak ada history, dialog macet "pending" | `app/api/discovery/route.ts:231-238` | Persist crawl_job 'pending' SEBELUM crawl + update saat selesai; poll client |
| Escalations queue | `queryFn` lempar `new Error()` polos pada !ok; 401/403 → tampil identik dgn antrian kosong | `app/(app)/escalations/page.tsx:38-43` | Tambah branch `isError` + handle 401/403 eksplisit |
| Field — visit log | `OUTCOME[v.outcome]` tanpa guard → outcome tak dikenal bikin `o.icon` throw, crash seluruh halaman | `app/(app)/field/visits/page.tsx:67-68` | `const o = OUTCOME[v.outcome] ?? OUTCOME['tidak-ada']` |
| Inbox handoff | `toggleAutoReplyForConversation` abaikan id → flip flag GLOBAL meski label per-percakapan | `lib/stores/handoff-store.ts:131-136` | Simpan override map per conversationId |
| Mailboxes connect | Hard-delete sending_account tanpa konfirmasi → orphan send_job (`processSendJobs` gagal "no sending account") | `app/api/tenant/mailboxes/route.ts:103-105`; `page.tsx:189` | Confirm dialog + soft-archive (flip `status`) ketimbang drop row |
| WA connect (QR) | Tanpa gateway, status nyangkut 'pending' selamanya, tombol disabled, tanpa timeout/penjelasan | `app/api/wa/session/route.ts:36-39`; `wa-connect-card.tsx:59,103-107` | Server flag `configured?` (WA_GATEWAY_TOKEN) + gate tombol + timeout client |
| Content create | Store tidak persist (no zustand persist, no PUT) → semua konten hilang saat refresh, padahal KB/pipeline persist | `lib/stores/content-store.ts:17` | Tambah tabel + `/api/db/content` GET/PUT, persist store |
| Penawaran editor | `send()` panggil `save(true)` silent lalu POST send walau save 500 → email pakai total basi tanpa peringatan | `app/(app)/penawaran/[id]/page.tsx:138-158` | Abort send jika pre-send save gagal + surface error |
| Public quote | Accept/reject publik hanya token, tanpa rate-limit; siapapun dgn link bisa mutasi stage deal | `app/api/public/quote/[token]/route.ts:36-43` | Token bertanda-tangan/kadaluarsa + langkah konfirmasi sekali pakai |
| Workspace hub | GET catch return `{data:null}` HTTP 200 → DB error nyangkut di skeleton selamanya (bukan not-found) | `app/api/workspaces/[id]/route.ts:52` | Return 5xx (atau flag `source` yang dicek page) |

---

## 3. Matriks CRUD

`✓` = ada+wired ke DB · `mock` = store/fixture saja · `—` = tidak ada · `(indir)` = lewat flow lain

| Entitas | C | R | U | D | Catatan |
|---|---|---|---|---|---|
| Contact | (indir) | ✓ | — | hard | Tak ada form create manual (`PUT /api/db/contacts` ada tapi tak dipakai); DELETE tak cascade comms (`contacts/route.ts:79`) |
| Company/Person (profil) | (indir) | ✓ | ✓ | **—** | Tak ada delete/archive sama sekali untuk junk profile |
| Crawl job (discovery) | ✓ | ✓ | NA | — | Append-only log (acceptable) |
| Deal | **—** | ✓ | ✓(stage/value/close) | **—** | Tak ada create/delete UI; `workspaceId` tak ikut ter-persist (bug) |
| Product (pipeline) | mock | mock | dead | mock | `updateProduct` ada tapi tak dipanggil UI; tak sentuh `productTable` |
| Marketplace listing | ✓ | partial | — | **—** | Tak ada dedup, tak ada delist/edit UI |
| Order (e-commerce) | NA | mock | mock | — | Tak ada tabel/route sama sekali |
| Cadence | ✓ | ✓ | **—**(UI) | **—**(UI) | DELETE `/api/db/cadences/[id]` ada tapi tak ada affordance; builder selalu mint id baru → insert-only |
| Cadence enrollment | ✓ | ✓ | **—**(UI) | **—** | PUT advance/stop ada tapi tak ada tombol unenroll |
| Conversation | **—** | ✓ | **—** | — | PUT upsert ada, tanpa caller |
| Message | **mock** | ✓ | NA | — | Send lokal saja, tak persist (PUT mati) |
| Auto-reply event | ✓(sys) | ✓ | ✓(resolve) | soft(dismiss) | Append-only event log, sehat |
| Quote | ✓ | ✓ | ✓ | **—** | Tak ada DELETE/archive; nomor rawan race |
| Subscription | ✓(webhook) | ✓ | ✓(webhook) | soft(canceled) | Upsert non-atomik |
| Content | mock | mock | partial(status) | mock(hard) | Tak persist; tak ada edit body |
| KB (blob) | ✓ | ✓ | ✓ | hard(in-blob) | Last-write-wins, risiko clobber multi-user |
| Autopilot run | ✓ | ✓ | ✓ | **—** | Tak ada DELETE untuk hapus riwayat |
| Field rep / Visit | **—** | mock | — | — | Tak ada tabel; visit log read-only (judul over-promise) |
| Retention flow/step | mock | mock | mock | mock(step) | localStorage persist (langgar aturan no-localStorage), tak ada delete flow |
| Workspace | ✓ | ✓ | ✓(PATCH, tak terjangkau UI) | soft(archive, no restore UI) | Edit & restore tak ada di UI |
| Team member | ✓(invite) | ✓ | ✓(role/pw) | hard(no confirm) | Tenant-blind (RLS off) |
| Mailbox (sending_account) | ✓×3 | ✓ | **—** | hard(no confirm) | Tak ada edit; delete orphan send_job |
| Send job | ✓ | ✓ | NA | — | Append-only; tak ada retry UI |
| Compliance/DSAR | ✓ | ✓ | ✓ | hard(DSAR erase) | Live & benar; perlu dry-run preview |
| Rep account (extension) | ✓(auto) | ✓ | ✓ | **—** | Tak ada revoke; hanya regenerate token |
| WA session | ✓ | ✓ | (gateway) | soft(disconnect) | Dua sistem WA terpisah (QR vs WAHA) |

**Gap CRUD paling menonjol:** Deal (no create/delete), Profil company/person (no delete), Marketplace listing (no delist), Quote (no delete), Cadence (DELETE endpoint yatim), Mailbox/Member (hard-delete tanpa confirm), Autopilot run (no delete).

---

## 4. Soft-delete & restore — rencana

**Pola standar yang disarankan** (terapkan seragam):
1. Tambah kolom `deletedAt: timestamp (nullable)` (atau pakai `status='archived'` yang sudah ada bila tersedia).
2. `DELETE` handler → set `deletedAt = now()` / `status='archived'` (bukan `tx.delete`).
3. Semua query READ default `WHERE deletedAt IS NULL` (atau `status != 'archived'`).
4. Endpoint restore: `PATCH .../[id] { restore:true }` → `deletedAt = null` / `status='active'`.
5. UI: filter chip "Arsip/Sampah" + aksi Restore + **confirm dialog sebelum delete** (saat ini hampir semua hard-delete tanpa konfirmasi).

**Tabel user-facing yang perlu soft-delete + restore:**

| Tabel/Entitas | Status sekarang | Aksi |
|---|---|---|
| `contactsTable` | hard-delete, no cascade | + `deletedAt`, soft DELETE, restore, **cascade/soft-delete comms terkait** (penuhi janji PDPA, `contacts/route.ts:79`) |
| `personTable`/`companyTable` (profil) | tak ada delete | `status` sudah dukung 'archived' (`active` default) → wire archive+restore UI |
| `dealsTable` | hard (upsert-only) | + `deletedAt` + restore (skema cuma punya `updatedAt`) |
| `quoteTable` | tak ada delete | + `deletedAt` + archive UI (draft salah jadi clutter permanen) |
| `marketplace_listing` | `status` active/delisted ADA, UI tak ada | wire delist (status→'delisted') + restore via `scope=mine` |
| `productTable` | store-only, hard | saat di-DB-kan, pakai pola soft-delete |
| `sending_account` (mailbox) | hard, orphan send_job | `status` ADA → soft-archive ketimbang drop row, jaga atribusi send_job |
| `membershipsTable` | hard, no confirm | `status` dukung 'disabled' → soft-disable + re-enable |
| `workspaceTable` | soft-archive ADA, **restore UI tak ada** | tambah filter "Diarsipkan" + tombol Restore (PATCH status='active') |
| `autopilot_runs` | tak ada delete | + DELETE (soft) untuk "Hapus riwayat" |
| Content / Retention flow | mock/localStorage | saat di-DB-kan, sertakan soft-delete (flow punya `status`) |

**Mark NA (append-only log/event — JANGAN soft-delete):** `crawlJobTable`, `messagesTable`, `auto_reply_event`, `engagement_event`, `cadence_step_run`, `send_job`, `ai_usage`, `auditLogTable`, `subscriptionTable` (cancel=soft state via webhook, biarkan). Marketplace acquire & DSAR erase juga di luar pola ini.

---

## 5. UX / flow

**Yang paling menghambat user memahami aplikasi:**

1. **"Misleading success" merata — top issue.** Toast sukses untuk aksi yang tak persist: Produk pipeline (`product-manager-dialog.tsx:61-97`), Konten (`content-store.ts:17`), Handoff config, E-commerce connect (`ecommerce/page.tsx:99-110`), Retention enroll, Inbox send, Task dashboard (`dashboard/page.tsx:446-470`). **Fix:** persist ke DB ATAU pasang badge "Mode demo / tidak disimpan" yang jelas per-kartu (bukan hanya di dialog).

2. **Dead-end navigasi inti.** List kontak → "Buka workspace terpadu" sering buntu "Workspace memerlukan percakapan" (`unified-workspace.tsx:119-155`) karena lead segar tak punya conversation; ditambah bug fixture (#1). **Fix:** izinkan workspace render rail prospect/enrichment/NBA tanpa conversation (kolom percakapan kosong, bukan blokir halaman).

3. **Tombol-tombol mati / stub.** "Tambah kontak" hanya redirect Discovery; Reports "Verifikasi sekarang"/"Tinjau" toast-only (`reports/page.tsx:1111-1121`); Compliance "Buat DPIA"/"Tolak" disabled; "Klasifikasi" endpoint ada tapi tak ada tombol (`profiles/page.tsx`). **Fix:** wire atau hapus; jangan biarkan affordance menjanjikan aksi yang tak ada.

4. **Empty state vs error state tertukar.** Workspaces, Escalations, Team monitoring, Billing menampilkan "kosong/dash" identik saat DB-error/403 (`workspaces/route.ts:24,57`; `escalations/page.tsx:38-43`; `team/page.tsx:49`; `billing/route.ts:72-75`). **Fix:** branch `isError` + return non-200 dari route agar bisa dibedakan.

5. **Loading state hilang.** Tak ada skeleton untuk autopilot history hydrate, dashboard tasks/funnel/activity, mailbox list, rep-account first load, retention rehydrate (flash "tidak ditemukan"). **Fix:** skeleton seragam.

6. **"Data live" badge menyesatkan.** Reports menampilkan badge "Data live" + delta hardcoded ('+18,2%') & stagnan sintetis (`reports/page.tsx:486-492,639-669`). **Fix:** hitung dari data nyata atau relabel "Demo data".

7. **Inkohesi nav lintas-halaman.** Auto-reply/Upsell/Cadence di header cadences tanpa link ke `/escalations`; dua sistem WhatsApp tanpa cross-link; docs link `/contacts?view=inbox` sedangkan hub link `/inbox`. **Fix:** tambah link kontekstual ("Lihat antrian eskalasi"), satukan/jelaskan dua jalur WA, normalisasi link inbox.

---

## 6. Enhancement backlog (dikelompokkan & diprioritaskan)

**P1 — Integritas data & kebenaran**
- Tenant-scope eksplisit di SEMUA query sampai RLS aktif (billing, members) — `WHERE eq(tenantId)`.
- Satukan classifier segmen+kota autopilot di `lib/` (estimate == selection).
- Nomor quote atomik + unique index; webhook `onConflictDoUpdate`.
- Unique index marketplace `(sellerTenantId, entityType, entityId)`.
- `workspaceId` ikut di deals PUT.

**P2 — Persistence yang hilang**
- Wire produk pipeline → `productTable` (`/api/db/product`).
- Tabel + `/api/db/content`; persist content store.
- Persist handoff config ke `platform_setting`.
- Wire inbox send/approve → `PUT /api/db/messages` + update conversation.
- Retention → DB (atau in-memory) untuk hentikan localStorage shadowing.

**P3 — Kelengkapan CRUD**
- Create/delete deal; create-contact manual (PUT upsert sudah ada).
- Delist+restore marketplace (`scope=mine` sudah ada server-side).
- Edit-cadence (`/cadences/[id]/edit` reuse builder); unenroll (PUT sudah ada).
- Edit mailbox; revoke token rep account.
- Hapus riwayat autopilot run (DELETE).
- Delete/archive profil & quote.

**P4 — AI jujur & dapat ditinjau**
- "Pakai template" builder/content → `/api/auto-reply` / `/api/draft-message` (real, sudah ada).
- Chat/KB-test: kembalikan sumber model nyata, bukan chips heuristik (`ai-chat.tsx:139-142`, `kb-test/route.ts:85`).
- Panel "Riwayat pengiriman" dari `recentStepRuns`/`recentEngagementEvents`/`recentAutoReplyEvents` (semua GET sudah ada, tak ada UI).
- Per-feature/per-day usage breakdown (`ai_usage` punya `feature`+`at`).

**P5 — Keamanan & robustness**
- Token quote bertanda-tangan/kadaluarsa + rate-limit.
- DB round-trip nyata (`SELECT 1`) di diagnostics, bukan cek env presence.
- Timeout pada `wahaStatus`/`sendWhatsApp`.
- Pindahkan guard tenant password-reset ke `lib/admin/users.setUserPassword`.
- Dry-run preview sebelum DSAR delete / retention purge.

**P6 — Polish UX**
- Confirm dialog untuk semua destructive (mailbox/member/contact/purge/archive workspace).
- Skeleton & empty/error state seragam (lihat §5).
- Surface pesan error server di toast (mailbox send, AI compose, quote).
- Per-card pending state marketplace acquire; "X dari Y" untuk bulk enrich.

---

## 7. Urutan kerja yang disarankan (wave-by-wave)

**Wave 0 — Stop kebocoran & crash (½–1 hari)**
- Tenant-scope `WHERE eq(tenantId)` di billing + members (cegah leak cross-tenant).
- Guard `OUTCOME[v.outcome] ?? fallback` (cegah crash halaman visit).
- Fix workspace GET catch return 5xx (cegah skeleton-hang).

**Wave 1 — Perbaiki alur inti yang putus (1–2 hari)**
- `useContact` → DB (perbaiki list→workspace).
- Workspace render tanpa conversation.
- `workspaceId` di deals PUT.
- Placeholder `{{...}}` di processor cadence.
- Wire inbox send/approve ke `PUT /api/db/messages`.

**Wave 2 — Hentikan "misleading success" (2–3 hari)**
- Persist: produk pipeline, content, handoff config, retention (DB atau in-memory konsisten).
- Special-case `source:'mock'` di cadence builder.
- Banner "Mode demo" jelas di e-commerce (atau bangun `/api/db/orders`).

**Wave 3 — Integritas transaksional (1–2 hari)**
- Nomor quote atomik + unique index.
- Webhook `onConflictDoUpdate`.
- Marketplace dedup unique index + skip/update.
- Autopilot: classifier tunggal (estimate==selection).

**Wave 4 — Soft-delete & restore terstandar (2–3 hari)**
- Terapkan pola §4 ke contacts, deals, quote, mailbox, member, workspace (restore UI), profil, marketplace delist, autopilot run.
- Tambah confirm dialog di semua destructive.

**Wave 5 — Empty/error/loading state & nav coherence (1–2 hari)**
- Branch `isError` + route non-200 (workspaces, escalations, team, billing).
- Skeleton seragam; per-filter empty state.
- Cross-link eskalasi/cadence/WA; normalisasi link inbox; relabel "Data live"→"Demo data" atau hitung nyata.

**Wave 6 — AI jujur, panel riwayat, keamanan (ongoing)**
- Wire template builder/content ke route AI nyata; sumber RAG nyata.
- Panel riwayat dari GET yang sudah ada.
- Token quote bertanda-tangan + rate-limit; `SELECT 1` diagnostics; timeout WAHA; dry-run DSAR.

Catatan kepemilikan: hampir semua "partial" berakar pada dua pola berulang — **(a) jalur DB sudah ada tapi tak dipanggil UI** (PUT contacts/messages/conversations, DELETE cadences, PATCH workspaces, `scope=mine`, classify, recent*-logs), dan **(b) state ephemeral yang berpura-pura persisten**. Mengejar dua pola itu secara sistematis menutup mayoritas temuan tanpa fitur baru.