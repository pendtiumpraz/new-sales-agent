# Agentic AI Sales — Prototype Build Spec for Claude Code

> A working mockup/prototype of Indonesia's WhatsApp-first sales intelligence platform.
> This is the spec. Read it end-to-end before you start.

---

## 1. Purpose

Build a clickable, visually polished **prototype** (not production) of the Agentic AI Sales platform — a channel-agnostic (B2B + B2C) sales intelligence tool for Indonesia. Position it as "Apollo's prospecting power + Mekari's local channel-stack."

### Why this prototype exists

- **Investor / partner demo**: show what the platform looks like and feels like before committing engineering budget.
- **User testing**: put it in front of 5–10 Indonesian sales managers and watch them try to do real tasks (build a cadence, check WhatsApp inbox, log a field visit).
- **Design lock-in**: settle aesthetic, IA, and copy decisions before real backend work begins.

### What it is and isn't

| Is | Isn't |
|---|---|
| A fully navigable Next.js app | A real product with auth, billing, real data |
| Mock data, mock APIs, mock AI responses | A WhatsApp BSP-connected system |
| Designed for screen recording + live demo | Hardened for security or scale |
| Bahasa Indonesia default with EN toggle | English-only |

### Success criteria

A non-technical person can sit down with the prototype and, within 2 minutes, demonstrate: (1) a unified inbox with WhatsApp + email + Instagram messages, (2) building a multi-channel cadence, (3) viewing a Kanban pipeline with deals in IDR, (4) a field rep checking in via the mobile mockup, (5) a Tokopedia order flowing into the CRM.

---

## 2. Tech Stack (lock these in, don't substitute)

```
Framework      : Next.js 14 (App Router) + TypeScript (strict mode)
UI             : Tailwind CSS + shadcn/ui (full component set installed)
Icons          : lucide-react
State          : Zustand for global, React Query for "server" mocks
Forms          : react-hook-form + zod validation
Charts         : Recharts
Tables         : @tanstack/react-table
DnD            : @dnd-kit (for Kanban and cadence builder)
Maps           : react-leaflet (open-source, no API key needed for mockup)
i18n           : next-intl (id default, en secondary)
Animations     : framer-motion (subtle only — see aesthetic rules)
Mock data      : faker.js + hand-curated JSON in /lib/mock-data/
Mock API       : MSW (Mock Service Worker) intercepting /api/* calls
Date / time    : date-fns + Asia/Jakarta timezone
Money          : Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })
```

**Hard rules:**
- No backend service. Everything is mocked.
- No real third-party API calls (no real WhatsApp, no real LLM). Stub the AI responses with pre-written canned outputs.
- No `localStorage` / `sessionStorage` — use Zustand with in-memory persistence only (since this is for demo).
- Mobile views built as **separate routes** (`/m/*`) rendered in a phone-frame component on desktop for the demo.

---

## 3. Aesthetic & Design Language

This is the most important section. Get this right and the prototype sells itself.

### 3.1 Color palette

```
Primary (brand)        : #0D9488   teal-600 — used sparingly for brand moments
Primary hover          : #0F766E   teal-700
Accent (WhatsApp)      : #25D366   used for WA channel indicators only
Accent (Tokopedia)     : #03AC0E   used for marketplace indicators
Accent (Instagram)     : #E1306C   used for IG channel indicators
Accent (Email)         : #6366F1   used for email channel indicators
Background (light)     : #F8FAFC   slate-50 — default page bg
Surface                : #FFFFFF
Border                 : #E2E8F0   slate-200
Text primary           : #0F172A   slate-900
Text secondary         : #475569   slate-600
Text tertiary          : #94A3B8   slate-400
Success                : #10B981
Warning                : #F59E0B
Danger                 : #EF4444
Info                   : #3B82F6

Dark mode primary bg   : #0F172A   slate-900
Dark mode surface      : #1E293B   slate-800
Dark mode border       : #334155   slate-700
```

### 3.2 Typography

- **Font family**: Inter (Google Fonts). Tabular numbers for any IDR amounts (`font-feature-settings: "tnum"`).
- **Display headers (page titles)**: 28–32px, weight 600
- **Section headers**: 18–20px, weight 600
- **Body**: 14px, weight 400, line-height 1.6
- **Small (metadata)**: 12px, weight 400, color text-tertiary
- **Numbers / IDR values**: tabular-nums, never below 14px

### 3.3 Visual motif

Pick ONE and use consistently across the entire app:

- **Card-based surfaces** with `border-slate-200` (0.5px on devices that support it, 1px otherwise), 12px radius, no shadow by default. Subtle shadow (`shadow-sm`) only on hover or active drag states.
- **No gradients**. No glass effects. No accent bars under headers (looks like AI slop).
- **Whitespace generous**: 24px between major sections, 16px between cards, 8px within card content.
- **Channel-color dots**: every WhatsApp/email/IG/Tokopedia reference gets a tiny 8px colored dot on the left. This is the through-line.

### 3.4 Component patterns (use shadcn/ui)

| Need | Component |
|---|---|
| All form fields | `Input`, `Select`, `Textarea`, `Checkbox`, `RadioGroup` |
| Buttons | `Button` (variants: default, secondary, ghost, destructive) |
| Modals / sheets | `Dialog` for actions, `Sheet` for side panels (contact detail) |
| Tabs | `Tabs` (used in inbox channel filter, contact detail) |
| Data display | `Table`, `Badge`, `Avatar` |
| Empty states | Custom — illustration + headline + CTA. Never just "No data." |
| Toasts | `sonner` — top-right, 4s auto-dismiss |
| Tooltips | `Tooltip` on every icon-only button |

### 3.5 Copy voice (Bahasa Indonesia default)

- **Direct, professional, warm**. Not corporate. Not chatty.
- Use **Bapak/Ibu** in sales templates, **Anda** in app copy.
- Numbers always in IDR format: `Rp 1.250.000` (with dots as thousand separators, no decimals for whole rupiah amounts).
- Dates in Bahasa: `15 Mei 2026` not `May 15, 2026`.
- Time: 24-hour format (`14:30 WIB`).
- Empty state copy is human: "Belum ada pesan masuk. Mulai cadence pertama Anda?" — not "No messages."

### 3.6 Iconography rules

- lucide-react only. Outlined style throughout.
- 16px in inline contexts, 20px in buttons, 24px in nav.
- Channel icons get color (WhatsApp green, etc.). Everything else uses `text-slate-600`.

### 3.7 What NOT to do

- ❌ Gradients of any kind
- ❌ Hero illustrations with floating shapes (looks like every other SaaS landing page)
- ❌ Emoji in UI copy (in chat messages = fine; in nav/buttons = no)
- ❌ "AI" branding everywhere — say what the feature *does*, not that it uses AI
- ❌ Microsoft Teams-style sidebar with 47 icons. Top nav + collapsible left sub-nav only.
- ❌ Page transitions, parallax, anything that screams "we have a designer." This is a tool, not a portfolio piece.

---

## 4. Information Architecture

```
/                              → Marketing landing page (Bahasa, with EN toggle)
/login                         → Mock login (any email/password works → dashboard)
/dashboard                     → KPIs, today's tasks, pipeline summary
/inbox                         → Unified inbox (WhatsApp + email + IG + LinkedIn)
/inbox/[conversationId]        → Single thread view
/contacts                      → Contact database with filters
/contacts/[id]                 → Contact detail, sequence history, channel preferences
/pipeline                      → Kanban deal pipeline
/pipeline/[dealId]             → Deal detail, activity log
/cadences                      → List of all cadences
/cadences/new                  → Cadence builder (drag-drop)
/cadences/[id]                 → Cadence detail + analytics
/field                         → Field sales overview (map + team list)
/field/visits                  → Visit log table
/ecommerce                     → Tokopedia / Shopee / TikTok Shop hub
/ecommerce/orders              → Marketplace order list
/ai-assistant                  → AI chat panel (canned responses)
/settings                      → Workspace, users, billing (mock), integrations
/settings/compliance           → UU PDP consent log + audit trail
/m/                            → Mobile field-rep landing (rendered in phone frame)
/m/check-in                    → GPS check-in screen
/m/visits/new                  → New visit form
/m/contacts                    → Mobile contact list
```

---

## 5. Detailed Feature List

For each feature: what to build, mock data needed, key components.

### 5.1 Marketing landing page (`/`)

**Why first**: this is the demo entry point. Investors land here.

- Hero: "Sales platform yang ngerti cara jualan di Indonesia." Subhead in 2 sentences. Two CTAs: "Coba Demo" (→ `/dashboard`), "Hubungi Sales" (→ contact form modal).
- Logo cloud (fake): 6 Indonesian company logos faded out (Tokopedia, Bank Mandiri, Halodoc, etc. — placeholder grey blocks with names).
- Feature highlight grid: 6 pillars from the deck (Multi-channel Core, Data + Prospecting, etc.) — each as a card with icon + 2-line desc.
- Comparison table: "Apollo vs Mekari Qontak vs Agentic AI Sales" — same as deck Slide 4.
- Pricing: 3 tiers (Starter Rp 199k, Growth Rp 449k, Enterprise Custom). IDR-formatted.
- Footer: PDPA notice, social links, language toggle (ID / EN).

### 5.2 Dashboard (`/dashboard`)

**Key KPIs (top row, 4 cards)**:
- Pipeline value (IDR formatted) + % change vs last month
- Deals closing this week (count + Rp value)
- WhatsApp response rate (%) + count of unanswered
- Active cadences + total contacts in cadence

**Below**:
- "Tugas hari ini" task list (8 mock tasks: "Follow up Pak Budi via WA", "Kirim quote ke PT Sentosa", etc.)
- Pipeline funnel chart (Recharts vertical funnel, 5 stages)
- Recent activity feed (last 10 events across team)

**Mock data**: 50 deals across 5 stages, 200 contacts, 12 active cadences.

### 5.3 Unified Inbox (`/inbox`)

**This is the killer feature. Spend the most polish here.**

- Left rail: conversation list. Each row shows: avatar, name, channel-color dot (WA green / email indigo / IG pink), last message preview (2 lines), timestamp, unread count badge.
- Filter chips at top of list: "Semua" / "WhatsApp" / "Email" / "Instagram" / "LinkedIn" / "Belum dibaca"
- Search bar
- Right: active conversation. Channel-themed top bar (WA green strip for WA convos). Message bubbles styled per channel:
  - WhatsApp: green outgoing bubbles, white incoming, classic WA layout
  - Email: threaded view with subject lines, sender/recipient block
  - Instagram: DM-style with photo previews if mock data has them
- Compose box at bottom matches channel
- Side panel (toggleable): contact info, deal status, "Tambahkan ke cadence" button, recent activity

**Mock data**: 30 conversations across channels, 200+ messages total, mix of Indonesian + English.

### 5.4 Contact Database (`/contacts`)

- Top: filter sidebar — Industry (BUMN, BPR, Retail, FMCG, Manufaktur, Tech), Region (Jakarta, Surabaya, Bandung, etc.), Company size, Consent status (consented / not consented / pending), Last contacted date
- Center: data table (sortable columns: Name, Company, Title, Channel preference, Last activity, Consent status)
- Bulk actions: "Tambah ke cadence", "Export CSV", "Hapus" (with confirmation that respects PDPA)
- Each row has a consent-status dot (green = consented, amber = pending, red = no consent / do not contact)
- Click row → opens contact detail sheet

**Mock data**: 500 Indonesian contacts with realistic names (Indonesian names mix: Budi, Siti, Ahmad, Putri, etc.), companies (PT Sentosa Jaya, CV Mitra Sejahtera, Bank Mandiri, etc.), titles (Direktur Utama, Manajer Penjualan, Komisaris, etc.).

### 5.5 Kanban Pipeline (`/pipeline`)

- 5 columns: Prospek, Kualifikasi, Penawaran, Negosiasi, Tutup
- Each column header: stage name + count + total value in IDR
- Cards: contact avatar, company, deal name, value (IDR), expected close date, channel-source dot
- Drag-drop between stages (@dnd-kit)
- Click card → deal detail panel

**Mock data**: 50 deals distributed across stages, IDR amounts ranging from Rp 5jt to Rp 2 miliar.

### 5.6 Cadence Builder (`/cadences/new`)

- Two-column layout: left = step list, right = step detail
- "+ Tambah langkah" button adds a step. Each step: channel (WA / Email / SMS / LinkedIn / Call task), delay (X hari setelah langkah sebelumnya), content
- Drag to reorder steps
- AI assist button on each step: "Bantuan AI" → opens modal that "generates" a draft (use 5–10 pre-written Bahasa templates and rotate through them)
- Right panel: when a step is selected, show full editor with template variables ({{nama}}, {{perusahaan}}, {{produk}})
- "Simpan & Aktifkan" CTA at top right
- Settings tab: sending hours (default 08:00–17:00 WIB), days (Sen-Jum), max sends per day

### 5.7 Field Sales (`/field`)

- Top: map (react-leaflet) showing Jakarta + Surabaya pins for active reps right now
- Sidebar: list of 8 field reps with status (Sedang di kunjungan / Istirahat / Selesai), today's visits count, last check-in time
- Click rep → highlight pin + show their route for today
- Tabs: "Live", "Hari ini", "Minggu ini"

### 5.8 Mobile Field-Rep App (`/m/*`)

- Rendered inside a phone-frame on desktop (iPhone 14 frame, ~390x844)
- `/m/` lands on rep's daily schedule: 6 visits planned, map snippet, "Mulai kunjungan" button
- `/m/check-in`: large "Check-in Sekarang" button, GPS coordinates display (mocked), photo upload mock
- `/m/visits/new`: form (customer name, visit type, notes, photo, follow-up needed)
- `/m/contacts`: searchable list with WhatsApp shortcut button per contact

### 5.9 E-commerce Hub (`/ecommerce`)

- Three channel cards at top: Tokopedia, Shopee, TikTok Shop. Each shows: today's orders count, revenue, "Hubungkan" or "Terhubung" status
- Below: unified order table — order ID, channel, customer, products, total IDR, status (Diproses / Dikirim / Diterima / Dibatalkan)
- "Pulihkan keranjang" button on each abandoned cart row → triggers a mock WhatsApp draft

### 5.10 AI Assistant (`/ai-assistant`)

- Chat panel that looks like a sales coach
- Pre-written response triggers for these prompts:
  - "Buatkan cadence email untuk SaaS B2B" → returns 5-step cadence in Bahasa
  - "Analisa pipeline saya" → returns paragraph with mock insight
  - "Siapa lead terbaik minggu ini?" → returns list of 5 contacts with scoring rationale
- If user types anything else, default response: "Saya bisa bantu dengan: pembuatan cadence, analisis pipeline, prospek scoring, dan optimasi pesan. Mau coba?"

### 5.11 Compliance Panel (`/settings/compliance`)

- Top: UU PDP compliance score card (mock — show 94/100)
- Consent log table: contact name, consent source (event / form / WA opt-in), date, version, status
- Right-to-delete request queue (mock — 3 pending)
- Audit trail: last 50 data operations with timestamps
- "Export laporan PDPA" button (downloads a mock PDF)

---

## 6. Mock Data Specification

Create these files in `/lib/mock-data/`:

```
contacts.json          → 500 contacts
deals.json             → 50 deals
conversations.json     → 30 conversations
messages.json          → 200+ messages
cadences.json          → 12 cadences
sequences.json         → cadence step definitions
field-reps.json        → 8 reps with locations
visits.json            → 40 field visits
orders.json            → 100 marketplace orders
companies.json         → 80 Indonesian companies
ai-responses.json      → 15 canned AI responses
consent-log.json       → 50 consent entries
```

### Realistic Indonesian data

**Names** (sample): Budi Santoso, Siti Nurhaliza, Ahmad Wijaya, Putri Indah, Dewi Lestari, Rizki Pratama, Mei Ling, Bambang Sutrisno, Joko Widodo, Andi Hidayat.

**Companies** (sample): PT Sentosa Jaya, CV Mitra Sejahtera Abadi, PT Bank Mandiri Tbk, PT Telekomunikasi Indonesia, PT Astra International, CV Sumber Rejeki, PT Sinar Mas, Koperasi Karyawan Sejahtera.

**Titles**: Direktur Utama, Komisaris, Manajer Penjualan, Kepala Cabang, Staf Pemasaran, Direktur Operasional, Wakil Direktur, Account Executive.

**Industries**: BUMN, BPR, Retail, FMCG, Manufaktur, Teknologi, Perbankan, Asuransi, Properti, Logistik.

**Cities**: Jakarta, Surabaya, Bandung, Medan, Semarang, Makassar, Palembang, Denpasar, Yogyakarta, Tangerang.

---

## 7. File Structure

```
agentic-ai-sales-prototype/
├── app/
│   ├── (marketing)/
│   │   └── page.tsx
│   ├── (app)/
│   │   ├── layout.tsx              (top nav + sidebar)
│   │   ├── dashboard/
│   │   ├── inbox/
│   │   ├── contacts/
│   │   ├── pipeline/
│   │   ├── cadences/
│   │   ├── field/
│   │   ├── ecommerce/
│   │   ├── ai-assistant/
│   │   └── settings/
│   ├── m/
│   │   ├── layout.tsx              (mobile frame wrapper)
│   │   └── (rep)/
│   ├── api/                        (MSW handlers)
│   └── globals.css
├── components/
│   ├── ui/                         (shadcn components)
│   ├── inbox/
│   ├── pipeline/
│   ├── cadences/
│   ├── shared/
│   │   ├── ChannelDot.tsx
│   │   ├── IDRAmount.tsx
│   │   ├── ConsentBadge.tsx
│   │   └── PhoneFrame.tsx
│   └── layout/
├── lib/
│   ├── mock-data/
│   ├── stores/                     (Zustand)
│   ├── utils/
│   │   ├── format-idr.ts
│   │   ├── format-date-id.ts
│   │   └── channel-config.ts
│   └── api-mock/                   (MSW setup)
├── messages/                       (next-intl)
│   ├── id.json
│   └── en.json
├── public/
└── tailwind.config.ts
```

---

## 8. Build Order (work in this sequence)

1. **Project setup**: Next.js 14, Tailwind, shadcn init, MSW, next-intl, Zustand. Set up `tailwind.config.ts` with the palette from §3.1.
2. **Shared layout + nav**: top nav (logo, search, AI button, notifications, profile) + left sidebar with nav items.
3. **Marketing landing page** — fully polished first; sells the project.
4. **Mock data files** — all 12 JSON files populated.
5. **Dashboard** — gets the layout and shared components battle-tested.
6. **Unified Inbox** — the crown jewel. Get this beautiful.
7. **Contacts + Contact detail sheet**
8. **Pipeline Kanban**
9. **Cadence Builder**
10. **Field Sales + Mobile views**
11. **E-commerce Hub**
12. **AI Assistant**
13. **Compliance Panel**
14. **Bahasa Indonesia translations** (sweep through all copy)
15. **Demo polish**: empty states, loading skeletons, tooltips, micro-animations.

---

## 9. Demo Script (build the prototype so this flow works perfectly)

For the live demo, this is the path the presenter walks through. Make sure it's bulletproof.

1. Land on `/` → 30-second pitch with the landing page
2. Click "Coba Demo" → `/dashboard`
3. "Today my team has 8 follow-ups" — point at task list
4. Click first task → opens `/inbox/[id]` showing a WhatsApp thread
5. Reply in WA — show channel-themed compose
6. Click contact name → contact detail sheet → "this person came from our Arsa Tower event, consented on March 15"
7. "Let me show you our pipeline" → `/pipeline` → drag a deal from Penawaran to Negosiasi
8. "We build cadences across channels" → `/cadences/new` → drag a WA step + email step + call step into sequence
9. Click "Bantuan AI" → modal generates Bahasa cadence
10. "Our field team is live" → `/field` → map with reps in Jakarta + Surabaya
11. Click one rep → "Let me show their mobile view" → phone frame appears with their daily schedule
12. "And we connect to Tokopedia" → `/ecommerce` → show orders flowing in, abandoned cart with one-click WA recovery
13. End on `/settings/compliance` → "94/100 UU PDP compliance score. Banks love this."

Total demo time target: 6 minutes.

---

## 10. Out of Scope (do NOT build)

- Real authentication (mock login = "any creds work")
- Real WhatsApp / Meta API integration
- Real email sending
- Real LLM calls (use canned responses)
- Real CRM imports
- Payment processing
- Multi-tenancy / workspace switching
- Admin user management beyond a single mock user list
- Analytics tracking / telemetry
- Accessibility audit (basic a11y from shadcn is fine; no WCAG full pass)
- Dark mode toggle (build light mode only — dark mode adds 30%+ work for demo little gain)
- Tests (it's a prototype)

---

## 11. Acceptance Checklist

Before declaring done, verify each:

- [ ] Landing page renders with full Bahasa copy and EN toggle works
- [ ] All 11 main routes load with no console errors
- [ ] Unified inbox shows 4 channel filters working
- [ ] Pipeline drag-drop persists in session (Zustand)
- [ ] Cadence builder allows adding/reordering/removing steps
- [ ] AI assistant returns canned response within 800ms (with typing animation)
- [ ] Mobile field-rep view renders inside phone frame on desktop
- [ ] All IDR amounts use proper formatting (`Rp 1.250.000`)
- [ ] All dates in Bahasa format (`15 Mei 2026`)
- [ ] Channel-color dots appear consistently across inbox, contacts, pipeline
- [ ] No real API calls in network tab (all MSW-intercepted)
- [ ] Lighthouse performance ≥ 85 on dashboard
- [ ] Works on Chrome, Safari (latest 2 versions only)

---

## 12. Final Notes

- **When in doubt, ship less polished but more complete.** A demo that covers all 11 routes adequately beats one with 3 routes perfected and the rest broken.
- **Indonesian copy matters more than visual perfection.** A grammatically wrong "Tambahkan ke cadence" button will be noticed faster than a 2px misalignment.
- **Speed is the demo's emotional message.** Use React Query's optimistic updates everywhere — actions should feel instant.
- **If a feature seems vague in this spec, ask before building.** Don't invent scope.
