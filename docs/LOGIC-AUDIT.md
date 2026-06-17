I have all the data I need from the JSON. Let me synthesize the report directly.

# Laporan Audit Logika, Alur & Scoping — Prioritas untuk Produk yang Layak Jual

## 1. Ringkasan

**Total temuan: 77** dari 8 cluster.

**Breakdown per severity:**
| Severity | Jumlah |
|---|---|
| 🔴 Critical | 14 |
| 🟠 High | 33 |
| 🟡 Medium | 22 |
| ⚪ Low | 8 |

**Breakdown per kategori:**
| Kategori | Jumlah |
|---|---|
| scoping | 24 |
| count-aggregation | 16 |
| flow-logic | 10 |
| action-mismatch | 10 |
| calculation | 7 |
| real-world-fit | 7 |
| data-mixing | 5 |

**Tema utama:** Lebih dari setengah temuan (45 dari 77) adalah **scoping + count-aggregation + data-mixing** — persis kelas bug yang sudah Anda konfirmasi sendiri di `/contacts/profiles` (perusahaan/orang kecampur antar-workspace + count kecampur). Ini bukan satu bug, ini pola sistemik yang berulang di hampir setiap halaman.

**Akar masalah paling berbahaya:** Isolasi multi-tenant **tidak diberlakukan sama sekali**. Setiap query `/api/db/*` mengandalkan Postgres RLS yang secara eksplisit BELUM diaktifkan (`drizzle/rls/enable-rls.sql` di luar migrasi auto-run; `lib/db/tenant-context.ts:24-25` menyebut `withTenant()` cuma "harmless transaction wrapper"). Artinya: **setiap tenant melihat data tenant lain** — deal, percakapan, pesan, mailbox, kontak. Ini bukan "demo belum rapi", ini kebocoran data lintas-perusahaan yang membuat produk tidak bisa dijual ke tim sales mana pun.

**Akar masalah kedua:** Fitur "workspace" — yang Anda bangun supaya fokus per tujuan tidak campur aduk (doc 44) — **tidak punya jalur untuk diisi data**. Seed tidak pernah men-tag siapa pun ke workspace, kontrol "+ workspace" yang dijanjikan banner tidak ada, dan cadence/deal/conversation/content tidak pernah distempel `workspaceId`. Hasilnya: setiap workspace baru **kosong selamanya**, dan filter workspace di mana-mana mati total.

### 5 Temuan Terparah

1. **Kebocoran lintas-tenant pada deals/companies/people** (`app/api/db/deals/route.ts:26-28`, `companies/route.ts:21-32`, `people/route.ts:27-38`) — setiap tenant lihat deal/perusahaan/orang tenant lain. Catastrophic, multi-tenant breach.
2. **Kebocoran lintas-tenant pada conversations/messages** (`app/api/db/conversations/route.ts:22-32`, `messages/route.ts:39-46`) — rep perusahaan A baca thread WhatsApp/email perusahaan B by id.
3. **Kebocoran lintas-tenant pada mailboxes/sends** (`app/api/tenant/mailboxes/route.ts:31-43`, `sends/route.ts:20-22`) — list mailbox & riwayat kirim (email penerima + subjek) seluruh database, dan rep bisa **menghapus** mailbox milik rep/tenant lain.
4. **Guardrail Autopilot adalah keamanan palsu** (`lib/autopilot/orchestrator.ts` — 0 referensi ke `config.guardrails`) — toggle "Jeda sebelum kirim", cap "Maks koneksi LinkedIn/hari", dan "Jam tenang" semuanya tidak dibaca. Switch keamanan yang diam-diam tidak melakukan apa pun = risiko ban LinkedIn + kirim tanpa persetujuan.
5. **Tab "Perusahaan" tidak pernah di-scope ke workspace** (`app/(app)/contacts/profiles/page.tsx:343-352`) — bug yang Anda konfirmasi sendiri. `companyTable` bahkan tidak punya kolom `workspaceId` (`schema.ts:335-358`). Plus badge count menghitung dataset penuh (`page.tsx:440,447`), bukan yang scoped.

---

## 2. 🔴 Scoping & Counting Bugs (workspace/tenant/tab) — PRIORITAS #1

Ini adalah inti dari "gak sesuai lapangan" yang Anda keluhkan. Saya pisah jadi tiga sub-kelompok karena fix-nya berbeda.

### 2a. Kebocoran TENANT (defense-in-depth: jangan percaya RLS yang mati)

Semua ini punya fix yang sama: **tambah predikat `eq(table.tenantId, ctx.tenantId)` eksplisit** di setiap query, JANGAN bergantung pada RLS yang belum aktif. Idealnya jalankan `enable-rls.sql` juga (belt-and-suspenders), tapi WHERE eksplisit wajib.

| Page | Masalah | Lokasi | Fix |
|---|---|---|---|
| pipeline | GET deals tanpa filter tenant — setiap tenant lihat deal, nilai, owner, close-date tenant lain | `app/api/db/deals/route.ts:26-28` | `.where(and(eq(dealsTable.tenantId, ctx.tenantId), …deletedAt))` |
| pipeline | GET companies: 3 query bocor (company, contactPoint, person-count) tanpa filter tenant; peopleCount men-scan SELURUH personTable | `app/api/db/companies/route.ts:21-32` | tambah `eq(*.tenantId, ctx.tenantId)` ke ketiganya |
| pipeline/contacts | GET people: per-rep filter pakai assignedTo/isNull tapi tidak filter tenant; cabang `isNull(assignedTo)` cocok dengan lead unassigned tenant LAIN | `app/api/db/people/route.ts:27-38` | tambah `eq(personTable.tenantId, ctx.tenantId)` di KEDUA cabang + company/cps select |
| inbox | GET conversations tanpa filter tenant — rep A lihat thread WA/email tenant B | `app/api/db/conversations/route.ts:22-32` | `.where(eq(conversationsTable.tenantId, ctx.tenantId))` |
| inbox/[id] | GET messages by conversationId tanpa filter tenant — baca thread tenant lain by id | `app/api/db/messages/route.ts:39-46` | `.where(and(eq(messagesTable.tenantId,…), eq(conversationId,…)))` |
| settings/mailboxes | GET mailboxes TANPA WHERE sama sekali — list semua sending account semua tenant; bisa dipilih & DIHAPUS | `app/api/tenant/mailboxes/route.ts:31-43` | member: `and(eq(tenantId), eq(userId))`; admin: `eq(tenantId)` |
| settings/mailboxes | GET sends `.limit(50)` tanpa filter tenant — riwayat kirim (email penerima+subjek) lintas tenant | `app/api/tenant/sends/route.ts:20-22` | `.where(eq(sendJobTable.tenantId, ctx.tenantId))` |
| settings/team | DELETE invite by id tanpa guard tenantId — admin tenant lain bisa cabut undangan kita | `app/api/tenant/invites/[id]/route.ts:18-23` | `.where(and(eq(id), eq(tenantId, ctx.tenantId)))` |

### 2b. Kebocoran PER-REP (doc 41: tiap sales cuma lihat lead-nya sendiri)

| Page | Masalah | Lokasi | Fix |
|---|---|---|---|
| contacts/map | Peta sebaran + ranking provinsi + total TIDAK per-rep & TIDAK workspace-scoped (Profil scoped, peta tidak → "Profil 30, peta 600") | `app/api/profiles/by-province/route.ts:35` | mirror people route: `or(eq(assignedTo, ctx.userId), isNull(assignedTo))` + terima `?workspace` |
| cadences | GET cadences tanpa scoping owner — member lihat sequence semua rep | `app/api/db/cadences/route.ts:26-29` | `where(or(eq(owner, ctx.userId), isNull(owner)))` saat `!isManager` |
| field | Halaman field tampilkan SEMUA rep + SEMUA kunjungan (lokasi live, hasil) tanpa scope ke user/tim | `app/(app)/field/page.tsx:30,34-37`; `lib/api-mock/hooks.ts:120-126` | scope by role: rep→own id, manager→tim, superadmin→all |
| autopilot | Run history (50 run terakhir) lintas workspace/rep; `autopilot_runs` tak punya `workspaceId`/`ownerUserId` | `app/api/db/autopilot-runs/route.ts:24-30`; `schema.ts:143-153` | tambah kolom workspaceId+ownerUserId, filter GET |
| escalations | Antrean eskalasi tenant-scoped tapi tidak per-rep/workspace; `CURRENT_AGENT='Anda'` hardcoded, tak ada ownership | `app/(app)/escalations/page.tsx:34-46` | join conversations, filter by workspaceId/assignedTo; catat siapa resolve |
| reports | Reports terlihat oleh Sales Rep (bukan managerOnly) tapi leaderboard + revenue per-rep dihitung dari SEMUA deal tenant — rep lihat closing & ranking kolega | `reports/page.tsx:285-299`; `side-nav.tsx:121` | gate seksi cross-rep ke manager, atau filter deriveSales ke deal milik user |

### 2c. Kebocoran/kerusakan WORKSPACE + count badge salah (bug founder)

| Page | Masalah | Lokasi | Fix |
|---|---|---|---|
| contacts/profiles | Tab **Perusahaan** TIDAK di-scope ke workspace sama sekali; `companyTable` tak punya `workspaceId` | `contacts/profiles/page.tsx:343-352`; `schema.ts:335-358` | tambah `workspaceId` ke companyTable + stempel saat crawl, ATAU derive dari people scoped |
| contacts/profiles | KEDUA badge count (`companies.data.data.length`, `people.data.data.length`) hitung dataset PENUH, bukan scoped/filtered — badge "2.000" sementara tabel tampil 3 baris | `profiles/page.tsx:440,447` | drive dari `{companyRows.length}` / `{peopleRows.length}` |
| contacts/profiles | `runBulk('company')` enrich SELURUH set perusahaan unscoped (`companies.data.data`), bukan `companyRows` yang tampil — bakar kuota web/AI untuk perusahaan yang tak terlihat | `profiles/page.tsx:362` vs `493-496` | ubah ke `companyRows.map(c=>c.id)` |
| contacts | Hero KPI "Dalam cadence" jumlahkan `cadence.enrolled` semua cadence aktif — double-count kontak di >1 cadence, bisa > Total kontak | `contacts/page.tsx:473-476` | hitung distinct contactId dari enrollment aktif, atau relabel "Total pendaftaran cadence" |
| contacts | Badge tab "Penemuan Lead" dari Zustand store client-only, sedangkan Discovery/Profil baca DB — badge tak cerminkan lead yang benar-benar di-crawl | `contacts/page.tsx:122-124,573` | back badge dengan DB yang sama (crawl jobs / person baru) |
| cadences | Filter workspace mati permanen — cadence tak pernah bawa `workspaceId` (PUT/POST tak tulis, builder tak handle, seed tak tag) → grid KOSONG kecuali "Lihat semua" | `cadences/page.tsx:105`; `route.ts:60-89`; `cadence-builder.tsx:170-180` | tambah picker workspace di /new, persist di PUT/POST, backfill seed |
| cadences | KPI hero (aktif/enrolled/avgReply) dihitung dari `cadences` PENUH, bukan `visible` yang difilter — "1.240 enrolled" sementara 0 cadence tampil | `cadences/page.tsx:110-122` | hitung summary dari `visible` |
| cadences/[id] | Picker enroll baca `/api/db/contacts` tanpa workspace; `contactsTable` tak punya `workspaceId` — bisa enroll kontak vertikal lain | `cadences/[id]/page.tsx:82-98`; `schema.ts:90-113` | tambah kolom workspace_id, terima `?workspace`, scope picker |
| cadences/[id] | Badge "X terdaftar" hitung SEMUA enrollment termasuk 'selesai'/'berhenti' — bukan yang aktif | `cadences/[id]/page.tsx:149,188,225` | tampilkan "X aktif / Y total", filter status |
| pipeline | Kanban filter `d.workspaceId === workspaceId` tapi TIDAK ADA UI yang set `workspaceId` deal (store & form tak punya) + seed tak tag → Kanban selalu kosong | `kanban-board.tsx:30`; `pipeline/page.tsx:152` | tambah workspaceId ke create/edit deal, default dari workspace aktif |
| pipeline | Cuma Kanban hormati `?workspace=`; tab default "Daftar enrichment" + hero KPI abaikan scope — yang PERTAMA dilihat rep adalah angka tenant-wide | `pipeline/page.tsx:43-54,128-139` | thread workspaceId ke EnrichmentTable + heroStats |
| workspaces/[id] | leadCount & list lead hanya dari `person.workspaceId`; tak ada yang men-tag → setiap workspace baru "0 lead" selamanya | `app/api/workspaces/[id]/route.ts:36-47` | tambah flow "Tambah lead dari Profil"/bulk-assign-by-segment |
| workspaces | leadCount hitung person termasuk yang `deletedAt` (soft-deleted) — badge over-report | `app/api/workspaces/route.ts:35-43` | tambah `where(isNull(personTable.deletedAt))` |
| marketplace | Tab "Publikasikan" list SEMUA company+people tenant tanpa workspace scope — bisa bulk-publish lead workspace lain | `marketplace/page.tsx:70-71,251-256` | pass workspace ke fetch + filter di route |
| marketplace | `selCos` "N dipilih" tanpa denominator, tak reset antar-tab; list di-slice 200 → bisa publish id yang tak terlihat | `marketplace/page.tsx:244-248,251` | mirror UX People: "dipilih dari N", prune ke set yang ter-render, reset on tab change |
| content | `/content` route SCOPED tapi tak ada komponen baca `?workspace=` — semua workspace tampil 32 item seed yang SAMA | `content/page.tsx:27`; `content-library.tsx:32` | tambah workspaceId ke ContentItem, filter sebelum stats & render |
| content | 5 KPI tile dihitung dari `items` global unfiltered, bukan scoped | `content/page.tsx:31-51` | hitung dari list workspace-filtered |
| content | 'approved' (8/32 item) tak dihitung tile mana pun — bucket paling actionable tak terlihat | `content/page.tsx:31-51` vs `content-config.ts:70` | tambah tile "Disetujui/siap dijadwalkan" |
| settings/ai | Usage rollup (panggilan/token/biaya) jumlahkan SEMUA row ai_usage tanpa window waktu/per-user/per-feature — angka lifetime yang tak bisa dikelola | `app/api/tenant/ai/route.ts:40-43,55-68` | window bulan ini + group by userId/feature |
| settings/kb | Hitung `sources.active` sebagai "Sumber aktif" tapi RAG cuma pakai `active && status==='indexed'` — KPI over-state | `knowledge-base/page.tsx:52` vs `ai-test-panel.tsx:171-176` | hitung `active && indexed` |
| settings | "Pengguna" tab tampil `USERS.length`(=5 hardcoded), "Tagihan" hardcoded "10/10 kursi", /settings/team baca DB — 3 sumber kebenaran beda | `settings/page.tsx:319,453-472` | drive dari /api/tenant/members + subscription seats |
| settings/billing | seatsQuota fallback ke `sub.seats`, tapi plan tak pernah di-seed quota → 2 dari 3 meter tak punya bar (silently degraded) | `tenant/billing/route.ts:44,63-67`; `schema.ts:743-750` | seed plan quota; Meter tampilkan state "tanpa batas/belum diset" |
| settings/compliance | MiniStats hardcode "78/18/4%" tapi consent log nyata 60/28/12% — headline GRC bertentangan dengan log auditnya | `compliance/page.tsx:183-186` | hitung dari `consentLog.length` |
| retention | `kpi.activeCustomers=351` statis, per-flow `enrolled` di-seed terpisah; enroll bump flow tapi tak sentuh kpi → dua angka bertengkar | `lib/api-mock/retention.ts:204-212`; `retention-store.ts:133-142` | derive activeCustomers dari sum flow.enrolled |
| retention | Kandidat dari `seedContacts.slice(0,8)` global, tanpa tenant/workspace; daysSincePurchase di-hash | `lib/api-mock/retention.ts:241-267` | build dari won deals/orders tenant aktif |
| reports | Funnel per channel DROP deal non-(wa/email/ig/tokopedia) — 29/50 deal hilang dari funnel tapi tetap di KPI revenue → funnel ≠ KPI | `reports/page.tsx:247-261` | tambah linkedin/shopee/sms + bucket "Lainnya" |
| dashboard | Channel filter cuma 4 channel; linkedin/sms/shopee (29/50 deal) tak bisa difilter, terlipat diam ke "Semua" | `dashboard/page.tsx:72-78,100-116` | derive CHANNEL_FILTERS dari data + "Lainnya" |
| settings/compliance | Data compliance (consent/DPIA/vendor) global tak per-tenant; gated Superadmin saja padahal PDP itu kewajiban per-controller | `compliance/page.tsx:49,102-111` | scope per-tenant, buka ke tenant_owner/admin (DPO) |
| team | Lead count per assignedTo tanpa dimensi workspace; tak bisa direkonsiliasi ke view workspace | `app/api/team/monitoring/route.ts:36-37` | group by (userId, workspaceId) atau terima `?workspace=` |
| ai-assistant | Assistant kirim SELURUH KB tenant; route global tak narrow per-workspace — rekomendasi produk bocor antar fokus | `ai-chat.tsx:71-72,149`; `chat/route.ts:114-129` | pass productId/targetSegment workspace aktif, narrow KB |
| contacts/map | "X orang · Y provinsi" tak masukkan orang tanpa provinsi (UNKNOWN difilter server-side) → "350 orang" padahal 600 | `contacts/map/page.tsx:57`; `by-province/route.ts:49-58` | label "X orang terpetakan" |

---

## 3. 🟠 Flow & Action-Mismatch

Alur buntu atau tombol yang melakukan hal berbeda dari klaimnya. Ini merusak kepercayaan karena rep mengikuti instruksi UI dan tidak terjadi apa-apa (atau terjadi hal yang salah).

| Page | Masalah | Lokasi | Fix |
|---|---|---|---|
| **autopilot** | **Guardrail = keamanan palsu.** "Jeda sebelum kirim", cap "Maks LI/hari", "Jam tenang" disimpan ke `config.guardrails` tapi orchestrator TAK PERNAH membacanya. Blast tanpa pause meski toggle ON, abaikan cap & quiet hours | `lib/autopilot/orchestrator.ts` (0 match); `guardrails-panel.tsx:104-130` | baca guardrails sebelum step send; pause+status='paused' bila toggle ON; cap `min(audienceCap, maxLiPerDay)`; skip jam tenang Asia/Jakarta |
| contacts/profiles | Banner janji "klik + workspace untuk menambah" tapi kontrol '+' TIDAK ADA di mana pun; `tagWorkspace` mutation didefinisikan tapi tak pernah dipanggil → workspace tak bisa diisi | `profiles/page.tsx:215-230,530-532` | tambah aksi per-baris '+ Workspace'/'Lepas' yang panggil tagWorkspace |
| retention/[flowId] | "Simpan filter" hanya simpan segment/min/max — TAK ADA aksi yang enroll audiens hasil filter. Banner janji "akan menentukan siapa yang diikutsertakan" tapi tak ada yang masuk | `retention/[flowId]/page.tsx:310-338`; `audience-filter.tsx:70-78` | tambah aksi "Daftarkan audiens ini" yang bulk-enroll, atau relabel sebagai preview |
| cadences/new | Tab "Pengaturan" (jam kirim, hari, max/hari, skip libur) dikumpulkan ke state lokal tapi TAK PERNAH dipersist — banner sendiri akui "belum tersimpan". Rep set jadwal, klik Aktifkan, cadence abaikan semuanya | `cadence-builder.tsx:157-207`; `processor.ts` | persist schedule + honor di processCadences, ATAU sembunyikan tab di prototype |
| cadences | "Jalankan sekarang" saat workspace-filtered tetap proses SEMUA enrollment tenant — rep kira jalankan 1 workspace, malah blast semua workspace | `cadences/page.tsx:420-453`; `processor.ts:104-139` | pass workspaceId ke /process, filter due by workspace |
| inbox | Buka percakapan / reply / human-takeover TIDAK PERNAH clear unread. Badge "Belum dibaca" tetap nyala selamanya → rep tak tahu mana yang outstanding | `message-thread.tsx`; `conversation-list.tsx:37,126` | set unread:0 saat thread dibuka & saat outbound send, PUT row + update cache |
| inbox | Switch auto-reply per-percakapan di HandoffPanel sebenarnya toggle flag GLOBAL — flip 1 customer matikan auto-reply SEMUA percakapan | `handoff-panel.tsx:62,237-241`; `handoff-store.ts:156-161` | implement override per-conversation, atau pindahkan switch ke Settings |
| ecommerce | "Hubungkan" marketplace cuma flip state lokal + toast "terhubung", persist nol → reload disconnect lagi. "Pulihkan" hanya Set lokal | `ecommerce/page.tsx:99-110,249-258` | persist via API, atau softening copy ke "Mode demo — belum disimpan" |
| penawaran | List baca workspace HANYA dari URL `?workspace=`, bukan store. URL tanpa param → API list SEMUA quote tenant lintas workspace, sementara switcher tampil 1 workspace aktif | `penawaran/page.tsx:48,60-71`; `quotes/store.ts:51-58` | resolve dari `useWorkspaceStore().active?.id`; listQuotes jangan return semua bila tak ada workspace |
| penawaran | Card link & back-link tanpa `?workspace=` → round-trip diam-diam melebar ke semua workspace | `penawaran/page.tsx:157`; `[id]/page.tsx:189-191` | bangun href dengan `withWorkspace()` |
| penawaran/[id] | "Susun ulang dgn AI" overwrite state lokal tanpa persist; toast "Draf AI dimasukkan" implikasikan tersimpan, tapi navigasi keluar = hilang | `penawaran/[id]/page.tsx:121-138` | auto-save setelah compose, atau guard unsaved + soften toast |
| penawaran/[id] | Editor bisa edit quote SETELAH sent/accepted; public token page tampil field live → ubah line item diam-diam ubah yang dilihat/disetujui customer | `penawaran/[id]/page.tsx:205-230`; `public/quote/[token]/route.ts:10-26` | lock/version quote setelah sent; block update field finansial bila status≠draft |
| settings/ai | Header "Pilih 1 model aktif **per workspace**" tapi `tenant_active_model` PK = tenantId — set di 1 workspace ubah untuk SEMUA orang | `settings/ai/page.tsx:122`; `tenant/ai/route.ts:92-100` | key by (tenantId, workspaceId), atau koreksi copy ke "per tenant" |
| settings/kb | Badge "Live · Deepseek-flash" hardcoded, padahal route resolve model aktif (bisa Anthropic/OpenAI/Google). Sama di ai-chat SourceBadge | `kb/ai-test-panel.tsx:348-351,440`; `ai-chat.tsx:512` | return modelString resolved, render yang sebenarnya |
| settings/kb | Mode MOCK: response digerakkan scenario.segment hardcoded, abaikan textarea "Pertanyaan prospek" — edit prompt, jawaban tetap canned | `kb/ai-test-panel.tsx:102-210,275-292` | jalankan `composeKbReply(prompt, kb)` di mock mode |
| escalations | "Riwayat" bisa diam-diam drop history nyata: API return 30 row terbaru, client filter !escalated lalu slice 15. Bila 30 terbaru mayoritas escalated → history nyaris kosong | `escalations/page.tsx:36-46`; `autoreply.ts:278-282` | query queue & history terpisah server-side |
| contacts | Selection persist lintas paginasi/search/filter; bulk bar aksi pada selection stale/tak terlihat. Pilih 20, search→3, export dapat file 2-baris tapi bar bilang "20 dipilih" | `contacts/page.tsx:130,435,674-679` | clear selection on filter/page change, atau hitung visibleSelected |
| field | Pilih rep di tab "Semua" lalu pindah "Live" tak clear selectedId → detail+map render rep yang tak ada di list terlihat | `field/page.tsx:34-37,104-121` | reset selectedId bila tak di list |
| cadences/new | "Buat ulang"/"Draf AI" cuma cycle array hardcoded 2-item dengan spinner fake 600ms — tak panggil model meski Deepseek dikonfigurasi (padahal processor PANGGIL model nyata saat kirim) | `cadence-builder.tsx:567-645,69-87` | wire ke /api personalization, atau rename "Template" jujur |

---

## 4. 🟡 Real-World Fit

Yang tidak sesuai cara sales/marketing Indonesia bekerja nyata. Ini yang membuat rep bilang "ini gak kepake di lapangan".

| Page | Masalah & dampak lapangan | Lokasi | Saran |
|---|---|---|---|
| **marketplace** | **Publish PERSON tak menegakkan consent.** Hanya blok `opted_out`; person `consent=unknown` (cuma di-scrape, tak pernah opt-in) ikut ter-publish. Whitelist `SHAREABLE_CONSENT` ada tapi TAK PERNAH dipakai. UU PDP butuh kebalikannya: blok kecuali opted_in/legitimate_interest | `lib/marketplace/store.ts:116-126`; `settings.ts:30` | gate listing pada whitelist; skip bila `!SHAREABLE_CONSENT.includes(consent)`, surface alasan "tanpa consent" |
| ecommerce | "Abandoned cart" disamakan dgn "cancelled order" — semua abandoned dipaksa status 'dibatalkan', lalu tawarkan "Pulihkan" (copy: "keranjang masih kami simpan"). Salah untuk order yang sudah dibatalkan. Tokopedia/Shopee juga tak expose pre-checkout cart via order API | `ecommerce/page.tsx:196-209`; `generate-mock-data.ts:368` | pisah state 'keranjang' vs 'dibatalkan'; "Pulihkan" hanya untuk abandoned, "Tawarkan ulang" untuk cancelled |
| workspaces/[id] | List lead workspace hub tampil nama+title tapi TIDAK companyName — untuk B2B, perusahaan adalah qualifier utama, jadi lebih sulit di-triage dari tabel Profil | `workspaces/[id]/page.tsx:238-249` | resolve & render companyName (join companyTable seperti /api/db/people) |
| team | Tanpa DB (default prototype), monitoring return `{data:[]}` → roster kosong, "Total closing Rp 0". Tak ada mock fallback (route lain fallback ke seed) → layar manager terlihat rusak | `app/api/team/monitoring/route.ts:20` | sediakan mock roster fallback dari distinct owner seed deals |
| reports | "Akurasi AI" definisikan 'error' = step yang fallback ke mock provider (`source==='mock'`). Tanpa API key, "Tingkat kesalahan AI 100%" — padahal itu cuma offline normal. Manager bisa pause otomasi karena salah baca | `reports/page.tsx:335-372` | rename "Tingkat fallback template", atau track flagged response nyata dari escalation table |
| settings/billing | Harga `/kursi/bln` ditampilkan tapi total bulanan (price × seats) tak pernah dihitung — pekerjaan utama halaman billing justru jawab "berapa saya bayar?" | `settings/billing/page.tsx:104,107-109` | tambah baris total `Rp N/bln (8 kursi × Rp X)` |
| content | Field 'audience' free-text tapi library tak punya filter audience; tak ada linkage ke KB segment (UMKM/Menengah/Korporat) — konten tak bisa ditarget koheren | `content-library.tsx:36-54`; `content-create-dialog.tsx:48` | jadikan audience select terikat KB segment + chip filter |
| settings/compliance | Antrean hak hapus = konstanta statis 3-baris, tak nyambung ke DSAR live. "3 menunggu" tak pernah berubah — kewajiban legal time-bound jadi dekoratif | `compliance/page.tsx:79-83,219` | feed dari sumber DSAR live |
| settings/mailboxes/extension | DUA sistem WhatsApp konflik: WAHA (sesi GLOBAL env var, 1 nomor platform) vs gateway (per-rep/tenant). Keduanya klaim "kirim cadence WA via sesi ini" — rusak attribution per-rep | `mailboxes/page.tsx:352-427` vs `wa-connect-card.tsx`; `waha.ts:10-12` | pilih satu model; untuk attribution per-sales drop WAHA global / buat per-rep |
| cadences/[id] | Counter `enrolled` denormalisasi: bump on enroll, TAK PERNAH decrement on stop/complete; list card baca `cad.enrolled`, detail baca `enrollments.length` → dua angka sama cadence beda | `cadence-enrollments/route.ts:90-96`; `cadences/page.tsx:351` | derive dari tabel enrollment, atau recompute setelah enroll/stop |
| retention/[flowId] | triggerCondition free-text prosa disimpan ke localStorage only; "disimpan" overstate durabilitas. Trigger tak bisa drive enrollment | `retention/[flowId]/page.tsx:103-110`; `retention-store.ts:54-56` | model trigger sebagai rule terstruktur, persist ke DB |
| inbox | Channel filter expose LinkedIn/SMS tapi composer & auto-reply treat semua non-email sebagai WhatsApp (bubble hijau, "Ketik pesan WhatsApp…", prompt "Tulis balasan WhatsApp"). Engine collapse ke email-atau-whatsapp | `message-thread.tsx:168,278`; `autoreply.ts:189` | composer & prompt channel-aware semua channel |
| inbox | Sentiment/handoff/last-AI-time dari fixture hardcoded ke 16 seed id (cv_0015…). Conversation DB/baru selalu neutral 0 + "menit lalu" basi → fitur auto-escalate tak track thread nyata | `lib/api-mock/handoff.ts:36-201` | derive dari messages nyata (timestamp + sentiment pass) |

---

## 5. Calculation Bugs

Math/skor/tanggal/uang yang salah hitung.

| Page | Masalah | Lokasi | Fix |
|---|---|---|---|
| settings/billing | Usage dijumlah ALL-TIME tapi dibanding kuota BULANAN. 9.000 email/tahun vs 5.000/bln → meter merah 100% selamanya, bahkan tanggal 1 bulan baru | `tenant/billing/route.ts:28-43` | filter `gte(at, startOfMonth)` untuk kedua agregasi |
| settings/mailboxes | `sentToday` (cap harian) di-increment tapi TAK PERNAH di-reset — tak ada cron/cek tanggal. Setelah 200 kirim kumulatif, mailbox macet selamanya; UI bilang "/hari ini" tapi counter lifetime | `lib/mail/send.ts:107,124-128`; `schema.ts:697` | track sentTodayDate, reset bila beda hari; atau hitung dari send_job where sentAt::date=today |
| penawaran/[id] | Customer ACCEPT quote → deal dipaksa ke 'negosiasi' (bukan 'tutup'), UNCONDITIONALLY — deal yang sudah 'tutup' (won) di-REGRESS mundur ke negosiasi. Acceptance ADALAH sinyal closing | `quotes/store.ts:256-259`; `pipeline-store.ts:187-193` | accept → 'tutup' + closedAt; guard jangan mundur (hanya set bila index saat ini < target) |
| content | Window KPI di-anchor ke konstanta hardcoded NOW=2026-05-25, MONTH_START=2026-05-01 — beku di Mei, tak maju. Tanggal nyata Juni → "Terjadwal 7 hari" window bulan lalu | `content/page.tsx:22-24,40-47` | derive NOW dari Date.now(), MONTH_START via startOfMonth |
| content | create-dialog `min='2026-05-25'` hardcoded; jam dipaksa 09:00 | `content-create-dialog.tsx:107-109,235` | set min ke hari ini |
| pipeline | Product-fit pakai 2 transform tanpa makna: `sizeFromValue()` map nilai deal IDR ke headcount band; `matchProducts` rank by `abs(value/100 - price)`. UMKM 1 deal besar direkomendasi paket Enterprise — rekomendasi = noise | `lib/api-mock/enrichment.ts:96-102,142-156` | drive dari company size/industry nyata + product ICP, drop /100 |
| reports | avgCycleDays = `22 + hash(...)%14` (hash dari ukuran dataset, bukan cycle nyata); deltas KPI semua hardcoded string ('+18,2%', '+4 deal', '-3 hari') disajikan sebagai analytics live di bawah timestamp "Diperbarui" | `reports/page.tsx:238-240,639-670` | hitung cycle dari (expectedClose - createdAt); hapus delta fabricated |
| reports | "Deal stagnan >30 hari" dipalsukan dengan `max(stale, min(8, hash%14))` — inject count yang tak ada; noValue/noContact selalu 0 (data tak pernah kosong) → "X masalah" badge fabricated | `reports/page.tsx:480-492` | report `stale` sebenarnya; seed dirty rows atau label "0 masalah — data bersih" |
| reports | Win rate = `won / prospek` (won / deal di stage 'prospek' saat ini), bukan won / total-entered-funnel — bisa >100% | `reports/page.tsx:822-823` | denominator = total deal yang masuk funnel channel |
| cadences | Avg reply rate exclude cadence `replyRate===0` dari numerator DAN denominator → bias ke atas. Manager baca "32%" padahal separuh cadence 0% reply | `cadences/page.tsx:114-120` | include replyRate===0 di denominator |
| retention/[flowId] | `estimateAudience` abaikan segment DAN tags — filter cuma by daysSincePurchase. Toast "X pelanggan memenuhi" implikasikan segment/tag dipakai; ubah ke "Korporat VIP" angka tak berubah | `lib/api-mock/retention.ts:296-305` | beri kandidat atribut segment/tag, filter di estimate |
| dashboard | "Closing minggu ini" filter `t <= WEEK_AHEAD` tanpa lower bound → deal overdue (expectedClose di masa lalu) terhitung "closing minggu ini". Laten karena NOW dipin, tapi salah | `dashboard/page.tsx:122-126`; `hooks.ts:195-197` | `t >= NOW && t <= WEEK_AHEAD`; surface overdue terpisah |
| dashboard | Response rate = `unread===0 / total` — `unread` itu read-receipt, bukan reply. Rep mark-read semua tanpa reply → "Respon WA %" tinggi (vanity metric) | `dashboard/page.tsx:135-138` | hitung dari messages: thread inbound dgn ≥1 outbound setelah inbound terakhir |
| autopilot | `prospectsEngaged` di-bump `selected.length` saat seleksi (sebelum outreach) — hitung yang DITARGET, bukan yang dikontak. `liSent` adalah angka "engaged" nyata | `lib/autopilot/orchestrator.ts:242` | bump dari loop send-li-requests pada hasil 'sent', atau relabel "Prospek terpilih" |
| settings/ai | `fmtPrice` cetak USD per-1M tanpa format; "Estimasi biaya" USD `toFixed(4)` padahal app IDR-first | `settings/ai/page.tsx:45-46,139` | tampilkan IDR (konversi FX) atau minimal locale-format + estimasi IDR |

---

## 6. Urutan Kerja (Wave per Wave)

Disusun by dampak: keamanan/penjualan dulu, baru polish.

### Wave 0 — Tenant isolation (BLOCKER untuk jual ke siapa pun)
Tanpa ini Anda tidak bisa onboard tenant kedua. Satu pola fix berulang: tambah `eq(table.tenantId, ctx.tenantId)` eksplisit + jalankan `enable-rls.sql`.
- Patch 7 route di §2a: deals, companies, people, conversations, messages, mailboxes, sends, invites.
- Aktifkan `drizzle/rls/enable-rls.sql` dan koneksi sebagai role non-BYPASSRLS (belt-and-suspenders).
- **Definisi selesai:** buat 2 tenant, login masing-masing, pastikan nol data silang di semua list.

### Wave 1 — Bug founder: scoping workspace + count badge
Ini keluhan yang sudah Anda lihat sendiri; pelanggan demo pasti menabraknya.
- `companyTable.workspaceId` + filter tab Perusahaan; perbaiki badge count ke array filtered (§2c profiles).
- Bikin workspace **bisa diisi**: kontrol "+ workspace" per-baris di Profil + flow "Tambah lead dari Profil/bulk-by-segment" + backfill seed tag. Tanpa ini semua filter workspace mati & workspace kosong selamanya.
- Stempel `workspaceId` end-to-end: deals (store+form), cadences (builder+PUT), conversations (seed+upsert), content (ContentItem). Lalu hidupkan filter di pipeline/cadences/inbox/content/marketplace.
- Per-rep scoping: by-province map, cadences owner, field, autopilot history, reports leaderboard.

### Wave 2 — Safety & action-mismatch (mencegah insiden nyata)
- **Autopilot guardrails** — wire pause/cap/quiet-hours; ini risiko ban LinkedIn + kirim tanpa izin.
- **Marketplace consent** — gate publish person pada whitelist (risiko UU PDP).
- "Jalankan sekarang" cadence scope ke workspace (cegah blast lintas workspace).
- Per-conversation auto-reply switch (cegah matikan global tak sengaja).
- Inbox mark-read on open/send.
- Quote: accept → 'tutup' + guard jangan mundur; lock quote setelah sent.
- Mailbox `sentToday` reset harian (mailbox macet = outreach mati diam-diam).

### Wave 3 — Calculation & metric jujur
- Billing monthly window + total `price×seats`.
- Reports: avgCycle nyata, hapus delta fabricated, channel funnel lengkap (linkedin/shopee/sms), win-rate denominator benar, "AI fallback rate" bukan "kesalahan".
- Dashboard: closing-this-week lower bound, response rate dari messages.
- Content date window dari clock nyata.
- Cadence avgReply masukkan 0%; enrolled counter satu sumber.
- Compliance MiniStats hitung dari log nyata.

### Wave 4 — Real-world fit & flow buntu
- Retention: "Daftarkan audiens" action, estimate honor segment/tag, kandidat dari won deals.
- Ecommerce: pisah keranjang vs dibatalkan; persist koneksi atau softening copy.
- Workspace hub: render companyName.
- KB/AI: model badge jujur, mock mode pakai composeKbReply, per-tenant KB seed (cegah brand leak), per-workspace model atau koreksi copy.
- Cadence builder: AI-assist nyata atau rename "Template"; persist/sembunyikan tab Pengaturan.
- Inbox: channel-aware composer; sentiment dari messages nyata.
- Team monitoring mock fallback; attribute deal by ownerUserId (bukan nama free-text).

### Wave 5 — Polish (low severity)
- Settings user-count satu sumber; AI usage IDR + per-rep; KB "sumber aktif" = indexed; map "terpetakan"; field selection reset; retention badge filter; compliance per-tenant + DSAR-linked queue.

**Catatan penting tentang dua akar masalah:** Wave 0 dan Wave 1 bukan sekadar "banyak bug" — keduanya adalah **satu kelas masalah arsitektur** (tidak ada penegakan scope eksplisit di query, dan tidak ada jalur untuk men-tag entitas ke workspace). Memperbaiki pola sekali di satu route lalu menerapkannya konsisten akan menyelesaikan ~30 temuan sekaligus. Saya sarankan kerjakan dua wave ini sebagai satu sprint terfokus sebelum menyentuh apa pun di Wave 2+, karena tanpa keduanya produk secara harfiah tidak bisa didemokan ke dua pelanggan berbeda tanpa membocorkan data.