# Live demo script — click-by-click

A presenter-ready walkthrough of the Agentic Sales prototype. **Target: ~8–9
minutes.** Every click and talking point is spelled out. Legend:

- 🖱️ **CLICK** — exactly what to click
- 💬 **SAY** — the line to deliver
- 👁️ **SEE** — what the audience should notice

---

## Setup (before the room is watching)

1. Build & serve the production app (cleanest, no dev FOUC):
   ```bash
   rm -rf .next && npm run build && npm run start
   ```
   > If `next start` 500s with `MODULE_NOT_FOUND: _document`, the `.next` cache
   > is stale — re-run the line above.
2. Open `http://localhost:3000` in a fresh window, **full screen**, zoom 100%.
3. Make sure the language toggle reads **ID** (top nav / landing).
4. Pre-load nothing else — the whole story starts at `/`.

**One-line pitch to open with:**
> 💬 "This is Agentic Sales — a WhatsApp-first sales platform built for how
> Indonesia actually sells: every channel, the field team, the marketplaces,
> and UU PDP compliance, in one place."

---

## Scene 0 — Landing (≈30s) · `/`

- 👁️ **SEE** the bright coral landing, hero, comparison table, IDR pricing.
- 🖱️ **CLICK** the **ID / EN** toggle (top right) once each way.
  - 💬 "Bahasa-first, with an English toggle — the whole UI switches instantly."
- 🖱️ **CLICK** **"Coba Demo"** (coral button, top right or hero).
- 👁️ Lands on `/dashboard`.

---

## Scene 1 — Dashboard (≈45s) · `/dashboard`

- 👁️ **SEE** the **bento** layout + **top pill-nav** (no sidebar).
  - 💬 "One home base. Pipeline is Rp 45,6 miliar, WhatsApp response rate 87%,
    8 follow-ups due today."
- 🖱️ **CLICK** a **channel chip** — e.g. **"WhatsApp"** (under the header).
  - 👁️ The activity feed filters to WhatsApp. 🖱️ **CLICK "Semua"** to reset.
- 🖱️ **CLICK** the first task, **"Follow up Pak Budi via WA"** (the row text).
- 👁️ It jumps straight into the Inbox on a WhatsApp thread.
  - 💬 "Every task links to the actual conversation."

---

## Scene 1b — Prospecting (≈60s) · `/prospecting`

- 🖱️ **CLICK** **"Prospek"** in the top nav.
- 👁️ **SEE** the lead table sorted by **AI fit score**, the KPI strip, and the
  temperature chips.
  - 💬 "This is our Apollo-style prospecting — net-new leads scored by AI fit and
    intent."
- 🖱️ **CLICK** **"Crawl prospek baru"** → toast ("12 prospek baru ditemukan").
- 🖱️ On an **un-enriched** row, **CLICK** **"Perkaya"** → verified contact data
  fills in.
  - 💬 "One click enriches verified email, phone, and tech stack."
- 🖱️ **CLICK** a row → the **AI research sheet** opens.
  - 💬 "AI writes the company summary, surfaces buying signals, and drafts a
    personalized opener." → 🖱️ **CLICK "Tambah ke cadence outbound"**.
- 🖱️ **CLICK** the **"Inbound"** tab → on a lead 🖱️ **CLICK "Balas dengan AI"**.
  - 💬 "Inbound leads are auto-scored and can be answered by AI instantly."

---

## Scene 2 — Unified Inbox (≈90s) · `/inbox/...`

- 👁️ **SEE** the conversation list (channel dots + unread badges) and the
  channel-themed thread.
  - 💬 "WhatsApp, email, Instagram, LinkedIn — one inbox. The bubbles match each
    channel."
- 🖱️ **CLICK** the **"WhatsApp"** filter chip at the top of the list.
  - 👁️ List narrows to WhatsApp conversations.
- 🖱️ **CLICK** any WhatsApp conversation → 🖱️ **CLICK** a **"Saran AI"** reply
  chip above the composer (auto-fills the draft) → press **send**.
  - 👁️ A green outgoing bubble appends instantly.
  - 💬 "AI suggests replies; one tap and send — speed is the whole point."
- 👁️ **POINT** at the **contact panel** on the right.
  - 💬 "Here's the context: this lead came from the **Arsa Tower event** and
    **consented on 15 Mei 2026** — that consent record matters for UU PDP."
- 🖱️ **CLICK** **"Tambahkan ke cadence"** → toast confirms.

---

## Scene 3 — Pipeline (≈45s) · `/pipeline`

- 🖱️ **CLICK** **"Pipeline"** in the top nav.
- 👁️ **SEE** the 5-stage Kanban with IDR totals per column.
- 🖱️ **DRAG** a card from **"Penawaran"** to **"Negosiasi"**.
  - 👁️ Column totals recompute; toast confirms the move.
  - 💬 "Drag to advance a deal — values update live."
- 🖱️ **CLICK** any card → deal sheet opens → 🖱️ **CLICK "Tandai menang"**.
  - 💬 "Or close it won right here."

---

## Scene 4 — Cadences (≈60s) · `/cadences`

- 🖱️ **CLICK** **"Cadence"** in the top nav → 🖱️ **CLICK "Buat cadence"**.
- 👁️ **SEE** the two-pane builder.
- 🖱️ **DRAG** a step by its handle to reorder.
  - 💬 "Sequence WhatsApp, email, and call steps with delays between them."
- 🖱️ **CLICK** **"Bantuan AI"** on the content editor → 🖱️ **CLICK "Buat
  ulang"** once → 🖱️ **CLICK "Gunakan draf ini"**.
  - 💬 "AI drafts the message in Bahasa, tuned to the channel."
- 🖱️ **CLICK** the **"Pengaturan"** tab.
  - 💬 "Sending hours 08:00–17:00 WIB, Senin–Jumat — respects local working
    hours."
- 🖱️ **CLICK** **"Simpan & Aktifkan"** → toast.

---

## Scene 5 — Konten / Content planning (≈60s) · `/content`

- 🖱️ **CLICK** **"Konten"** in the top nav.
- 👁️ **SEE** the KPI strip + **Pustaka** library.
  - 💬 "Plan broadcasts and campaigns across WhatsApp, email, Instagram,
    Tokopedia."
- 🖱️ **CLICK** the **"Kalender"** tab.
  - 👁️ Month grid with color-coded scheduled posts.
- 🖱️ **CLICK** **"Buat konten"** (top right) → set **Jenis konten** = WhatsApp
  Broadcast → 🖱️ **CLICK "Bantuan AI"** → 🖱️ pick a **schedule date** → 🖱️
  **CLICK "Simpan & jadwalkan"**.
  - 👁️ Toast confirms; the item is now on the calendar.

---

## Scene 6 — Field Sales + Mobile (≈60s) · `/field` → `/m`

- 🖱️ **CLICK** **"Sales Lapangan"** in the top nav.
- 👁️ **SEE** the live map with pins in Jakarta & Surabaya + rep sidebar.
  - 💬 "We see the field team in real time."
- 🖱️ **CLICK** a rep in the sidebar → 👁️ their route draws on the map.
- 🖱️ **CLICK** **"Buka tampilan mobile"** (rep footer).
- 👁️ The **phone frame** appears (`/m`) with the rep's daily schedule.
  - 💬 "And here's what the rep sees on their phone."
- 🖱️ **CLICK** **"Mulai kunjungan berikutnya"** → 🖱️ **CLICK "Check-in
  Sekarang"**.
  - 👁️ GPS check-in succeeds.

---

## Scene 7 — E-commerce (≈45s) · `/ecommerce`

- 🖱️ **CLICK** **"E-commerce"** in the top nav.
- 👁️ **SEE** the Tokopedia / Shopee / TikTok cards + unified order table.
  - 💬 "Marketplace orders flow straight into the CRM."
- 🖱️ Find a **"Dibatalkan"** row with a **"Pulihkan"** button → 🖱️ **CLICK
  "Pulihkan"**.
- 👁️ A pre-written WhatsApp recovery message appears.
  - 💬 "Abandoned cart? One click drafts a WhatsApp to win it back."
- 🖱️ **CLICK** **"Kirim WhatsApp"** → toast.

---

## Scene 8 — Compliance / UU PDP (≈75s) · `/settings/compliance` · **the closer**

- 🖱️ **CLICK** the **profile avatar** (top right) → 🖱️ **CLICK "Kepatuhan UU
  PDP"**.
- 👁️ **SEE** the **94/100** score gauge + the AES-256 / AWS-Jakarta / DPO trust
  cards.
  - 💬 "This is what banks ask for. 94 out of 100 UU PDP compliance."
- 🖱️ **CLICK** the **"Jejak Persetujuan"** tab.
  - 💬 "Every consent is logged immutably — timestamp, IP, channel, policy
    version, source."
- 🖱️ **CLICK** the **"DPIA"** tab, then **"Risiko Vendor"** tab.
  - 💬 "Impact assessments and third-party vendor risk, built in."
- 🖱️ **CLICK** the **"Laporan"** tab → keep **Laporan Audit PDPA** → 🖱️ **CLICK
  "Generate laporan"** → wait for the ready state → 🖱️ **CLICK "Unduh PDF"**.
  - 💬 "And a regulator-ready report — ready to hand to KOMDIGI — generated on
    demand."

---

## Scene 9 — AI Assistant (optional ≈30s)

- 🖱️ **CLICK** **"Asisten"** in the top nav (slide-over opens).
- 🖱️ **CLICK** the suggestion chip **"Analisa pipeline saya"**.
  - 👁️ Typing animation, then a Bahasa insight.
  - 💬 "An always-on sales assistant for cadences, pipeline analysis, and lead
    scoring."

---

## Close (≈15s)

> 💬 "One platform: every channel in one inbox, automated cadences, content
> planning, a live field team, the marketplaces, and bank-grade UU PDP
> compliance — built for how Indonesia sells."

---

## Quick reference — nav labels

`Dasbor · Inbox · Kontak · Pipeline · Cadence · Konten · Sales Lapangan ·
E-commerce` — plus search (⌘K), **ID/EN**, **Asisten**, notifications, and the
**profile menu** (Profil / Pengaturan / Kepatuhan UU PDP / Keluar).

## If something goes sideways

- **Blank / unstyled page:** you're on a stale dev server — use the production
  build from Setup.
- **A drag doesn't "take":** click empty space, then drag again from the card
  body (Pipeline) or the grip handle (Cadence steps).
- **Want a reset:** refresh the page — all session edits (drags, sent messages,
  new content) reset to the seeded state.
