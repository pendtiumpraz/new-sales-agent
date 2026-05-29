# Use-case flows

How each feature is used — the persona, the trigger, the step-by-step path
through the UI, and the outcome. It's a prototype, so data / AI / sends are
mocked, but every flow below is clickable end-to-end.

> For a presenter-ready, click-by-click walkthrough see
> [DEMO-SCRIPT.md](./DEMO-SCRIPT.md).

---

## 1. Landing + Login — `/`, `/login`
**Who:** prospective customer / demo viewer.

1. Land on `/` — hero, 6 pillars, Apollo-vs-Mekari comparison, IDR pricing.
2. Toggle **ID / EN** if needed.
3. Either **"Coba Demo"** → `/dashboard`, **"Hubungi Sales"** → contact dialog,
   or **Masuk** → `/login` → any credentials → `/dashboard`.

**Outcome:** the visitor is pitched and dropped into the working app.

---

## 2. Dashboard — `/dashboard`
**Who:** sales manager / rep, first thing each morning.

1. Scan the **bento KPIs** — pipeline value + stage bar, WhatsApp response rate,
   deals closing this week, active cadences.
2. Read **"Tugas hari ini"** (8 prioritized tasks).
3. Click a task → it deep-links to the **relevant inbox conversation** for that
   task's channel.
4. Use the **channel quick-filter chips** to slice the activity feed.

**Outcome:** the manager knows the day's state and jumps straight to the
highest-priority action. This is the hub that feeds every other feature.

---

## 3. Unified Inbox — `/inbox`
**Who:** sales rep handling conversations.

1. The conversation list shows every channel together with channel-color dots +
   unread badges.
2. **Filter** (Semua / WhatsApp / Email / Instagram / LinkedIn / Belum dibaca)
   or **search**.
3. Click a conversation → the **channel-themed thread** opens (WhatsApp green
   bubbles, threaded email, IG/LinkedIn DM styling).
4. Reply in the **channel-matched composer** (bubble appends live).
5. Open the **contact panel** — who they are, *where the lead came from and when
   they consented*, their related deal, and **"Tambahkan ke cadence"**.

**Outcome:** one rep clears multi-channel messages without app-switching, with
full context beside each thread.

---

## 3b. Prospecting / Lead intelligence — `/prospecting`
**Who:** rep / SDR hunting net-new leads (Apollo-style).

1. **"Crawl prospek baru"** simulates discovery from LinkedIn / web.
2. **Temukan** tab — search + temperature chips (Panas / Hangat / Dingin); the
   table is sorted by **AI fit score** with enrichment status per row.
3. **Perkaya** a lead (fills verified email/phone/tech) or open the row → **AI
   research sheet** (AI company summary, buying signals, recommended opener).
4. Push to outbound: **Tambah ke CRM** / **Tambah ke cadence** (single or bulk).
5. **Inbound** tab — captured leads (website / form / WA / IG / marketplace) are
   AI-scored with a suggested action; **Balas dengan AI** auto-replies or
   **Alihkan** routes.

**Outcome:** net-new leads are discovered, enriched, AI-scored, and handed to
outbound — the front of the funnel.

---

## 4. Contacts — `/contacts`
**Who:** rep prospecting; manager doing list hygiene.

1. Narrow the 500-record DB with the **filter sidebar** (consent / industry /
   city) + search; **sort** columns.
2. **Select rows** (checkboxes persist across pages).
3. Run a **bulk action**: *Tambah ke cadence*, *Export CSV* (real download), or
   *Hapus* (opens a **UU-PDP-framed confirmation**).
4. Click any row → **contact detail sheet** (info, channel preference, consent
   source/date, sequence history).

**Outcome:** the right segment gets enrolled, exported, or cleaned —
compliantly.

---

## 5. Pipeline — `/pipeline`
**Who:** rep / manager working deals.

1. View the Kanban — 5 stages (Prospek → Tutup), each with count + IDR total.
2. **Drag a deal card** to the next stage (totals recompute, persists for the
   session).
3. Or click a card → **deal detail sheet** (contact, value, expected close,
   source channel, activity log).
4. Change stage via the dropdown, or hit **"Tandai menang"** (→ Tutup).

**Outcome:** deals advance visually; the team sees weighted pipeline value at a
glance.

---

## 6. Cadences — `/cadences`, `/cadences/new`
**Who:** rep / manager building outreach sequences.

1. View the **12 cadence cards** (status, channel mix, enrolled, reply rate).
2. **"Buat cadence"** → in the builder, **add steps** and **drag to reorder**.
3. Per step set **channel / delay / content**; insert variables (`{{nama}}`,
   `{{perusahaan}}`).
4. **"Bantuan AI"** generates a Bahasa draft → *Gunakan draf ini*.
5. **Pengaturan** tab — sending hours (08:00–17:00 WIB), days (Sen–Jum),
   max/day.
6. **"Simpan & Aktifkan."** Contacts enroll from Inbox / Contacts.

**Outcome:** a multi-channel, time-windowed follow-up sequence goes live; reps
stop chasing manually.

---

## 7. Content / Konten — `/content`
**Who:** marketing / sales-enablement.

1. KPI strip — drafts, in-review, scheduled this week, published, reach.
2. **Pustaka** tab — filter the library by type (WA broadcast / email / IG /
   Tokopedia / blog) + status; advance status via the per-card dropdown
   (`draft → review → approved → scheduled → published`).
3. **Kalender** tab — month grid of scheduled posts; click a day's **+** to
   create for that date; click a chip to preview + "Tandai diterbitkan".
4. **"Buat konten"** — composer with type, audience, body, **Bantuan AI**
   drafting, then *Simpan sebagai draf* / *Simpan & jadwalkan*.

**Outcome:** a planned content calendar across channels with an approval
workflow — the "planning" half of the platform.

---

## 8. Field Sales — `/field` + Mobile rep app — `/m/*`
**Who:** field-sales manager (desktop) and field reps (mobile).

**Manager:**
1. `/field` — **live map** with rep pins in Jakarta & Surabaya.
2. Sidebar list with each rep's status, visits, last check-in; toggle
   **Live / Hari ini / Minggu ini**.
3. Click a rep → draws their **route**; "Log kunjungan" → `/field/visits`.

**Rep (phone frame):**
1. `/m` daily schedule (6 visits + mini-map) → **"Mulai kunjungan berikutnya"**.
2. `/m/check-in` — GPS check-in button, coords, photo → **"Check-in Sekarang"**.
3. `/m/visits/new` — customer, type, notes, follow-up toggle.
4. `/m/contacts` — call or **WhatsApp** a customer in one tap.

**Outcome:** the office sees field activity in real time; reps log visits and
check in from the road.

---

## 9. E-commerce — `/ecommerce`
**Who:** ops / B2C seller team.

1. Three **marketplace cards** (Tokopedia / Shopee / TikTok Shop) — orders,
   revenue, connect status.
2. Scan the **unified order table** (ID, channel, customer, product, IDR,
   status).
3. On an **abandoned cart** → **"Pulihkan"** → a pre-written **WhatsApp recovery
   message** appears → send.

**Outcome:** marketplace orders flow into the CRM and abandoned carts are
recovered via the messaging stack — the "marketplace × WhatsApp" loop.

---

## 10. AI Assistant — top-nav slide-over + `/ai-assistant`
**Who:** any rep needing a quick assist.

1. Click **Asisten** in the top nav (slide-over) or open the full page.
2. Pick a suggestion chip or type.
3. After a short "typing" beat, get a canned Bahasa answer for **cadence
   generation**, **pipeline analysis**, or **lead scoring** (else a helpful
   default).

**Outcome:** drafting / analysis help without leaving the current screen.

---

## 11. Settings + UU PDP Compliance — `/settings`, `/settings/compliance`
**Who:** admin (settings) and the **Data Protection Officer** (compliance).

**Admin:** `/settings` tabs — workspace, team users/roles, channel integrations
(toggles), billing.

**DPO:** `/settings/compliance`
1. **Ringkasan** — 94/100 score, AES-256 / AWS-Jakarta / managed-DPO trust
   cards, right-to-delete queue, audit trail.
2. **Jejak Persetujuan** — immutable consent log (timestamp · IP · channel ·
   version · source).
3. **DPIA** — impact assessments per business process.
4. **Risiko Vendor** — third-party risk + DPA status + residency.
5. **Laporan** — pick report type + period → **Generate** → **Unduh PDF** of a
   regulator-ready (KOMDIGI) document.

**Outcome:** the DPO proves compliance and produces audit reports on demand —
the enterprise / bank-grade differentiator.

---

## How the flows connect (golden path)

```
Dashboard task → Inbox thread → reply → contact panel (consent + deal)
   → "Tambah ke cadence" → tracked in Pipeline → automated via Cadences
   → broadcasts planned in Konten → field follow-up via Mobile
   → marketplace orders in E-commerce → all consent/audit in Compliance
```

Every feature hands off to the next, so a lead never falls through a channel
gap.
