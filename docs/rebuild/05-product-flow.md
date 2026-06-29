# 05 — Coherent Product IA & Core Flow (REVISI fix)

> **Phase 02 wireframe ITERATION.** This doc supersedes the IA in `02-ia-flows.md`
> for the **tenant app shell** (Surface B). It is the response to the REVISI feedback in
> `user_requirement.md` §APPROVAL GATE (2026-06-28): the flow felt *aneh*, must use
> **all** existing features, must show **acquired contacts with B2C vs B2B segmentation
> in the Workspace**, and must give **Enrichment a clear, easy-to-reach surface**.
>
> Authoritative inputs: `user_requirement.md`, `architecture-decisions.md`,
> `loop-workflow/RULES-OF-THE-GAME.md`, `loop-workflow/standards/UI-UX-STANDARDS.md`.
> Wireframes are **low-fi (grayscale, layout + flow only)**. No app code here.
> Grain recap: **entitlements/modules/quota = TENANT**; **theme/branding = USER** (default
> Coral Sunset, edited at `/branding`). **1 workspace = 1 product.**

---

## 0. Why the old flow felt "aneh" (root cause)

I read the live app. The incoherence comes from **three competing navigation systems for the same job**, none of them complete:

1. **`/contacts`** says "leads are managed per-workspace now" and just lists workspaces → so it is a *second, worse* workspaces page. Dead-end.
2. **`/contacts/profiles`** is where contacts, B2C/B2B classification, and enrichment **actually live** — but it is buried behind a `ContactsTabs` bar (Kontak / Profil / Discovery / Peta) **and** a separate `ContactsSubnav` (1.Cari → 2.Hasil → 3.Sebaran → 4.Kelola). Two different sub-navs over the same four pages.
3. **The Workspace hub** (`/workspaces/[id]`) is the intended "real" flow (produk → market-fit → discovery → script → chat) but its lead list is a bare `LeadRow[]` with **no B2C/B2B segmentation and no enrichment surface** — the very things the user asked for live on a *different* page (`/contacts/profiles`).

So enrichment + B2C/B2B classification (which exist and work: `leadType ∈ {b2c_customer, b2b_partner}`, `/api/profiles/enrich`, `/api/profiles/classify`, `analyzeMarketFit → marketType B2B/B2C/mix`) are **real but stranded** away from the workspace where the user works. **`/prospecting` already redirects to `/contacts/discovery`** — evidence the IA was already being collapsed ad hoc.

**The fix:** one spine — **Workspace is the home of the flow**, and Contacts/Enrichment become **first-class surfaces reachable both globally (sidebar) and scoped inside a workspace**, with B2C/B2B shown as **tabs + badges** everywhere a contact appears, and Enrichment as its **own sidebar item + an inline panel** in the workspace.

---

## 1. Sidebar nav — ALL features grouped (nothing dropped)

One color-solid icon per menu (Sainskerta Rule 6). Sidebar background + active highlight follow the **user** theme (Coral Sunset default); per-menu icon colors are fixed wayfinding. `Gate` = tenant `enabled_modules` (from onboarding ∩ entitlements) and/or role.

Every existing route in `app/(app)/**` is mapped below — **the inventory is the contract: nothing is dropped, only regrouped.**

### Group A — Utama (daily spine)

| # | Menu | Route | Icon color | Gate | Replaces / absorbs (existing) |
|---|---|---|---|---|---|
| 1 | Dashboard | `/dashboard` | `#3B82F6` | always | `/dashboard` |
| 2 | **Workspace** | `/workspaces`, `/workspaces/[id]` | `#10B981` | `mod.workspace` | workspaces + the old `/contacts` landing |
| 3 | **Kontak** | `/contacts` | `#14B8A6` | `mod.crm` | `/contacts/profiles` (people+companies), `/contacts/map`, `/workspace/[contactId]` |
| 4 | **Enrichment** | `/enrichment` | `#8B5CF6` | `mod.enrichment` | `/contacts/discovery` engine + bulk enrich/classify (promoted out of profiles) |
| 5 | **Inbox** | `/inbox`, `/inbox/[id]` | `#6366F1` | `mod.inbox` | `/inbox`, `/escalations` (AI replies needing review = an Inbox filter) |
| 6 | **Pipeline** | `/pipeline` | `#F59E0B` | `mod.crm` | `/pipeline` (kanban + `enrichment-table` deal scoring) |
| 7 | Laporan | `/reports` | `#0EA5E9` | role ∈ {owner, admin, manager} | `/reports` |

### Group B — Jangkau & Closing (outreach — collapsible)

| Menu | Route | Icon color | Gate | Existing |
|---|---|---|---|---|
| Cadence | `/cadences`, `/cadences/[id]`, `/cadences/new` | `#7C3AED` | `mod.outreach` | `/cadences*` |
| Autopilot `AI` | `/autopilot` | `#F43F5E` | `mod.autopilot` | `/autopilot` |
| Penawaran | `/penawaran`, `/penawaran/[id]` | `#0D9488` | `mod.offering` | `/penawaran*` |
| Konten | `/content` | `#EAB308` | `mod.content` | `/content` |
| Asisten Sales | (drawer, ⌘K) | `#6366F1` | always | `/ai-assistant` + sidebar AI dock |

### Group C — Pasca-jual & Lapangan (collapsible)

| Menu | Route | Icon color | Gate | Existing |
|---|---|---|---|---|
| Retensi | `/retention`, `/retention/[flowId]` | `#EC4899` | `mod.retention` | `/retention*` |
| E-Commerce | `/ecommerce` | `#F97316` | `mod.ecommerce` | `/ecommerce` |
| Sales Lapangan | `/field`, `/field/visits` | `#22C55E` | `mod.field` | `/field*` |
| Monitoring Sales | `/team` | `#EF4444` | role ∈ {owner, admin, manager} | `/team` |
| Marketplace Data | `/marketplace` | `#3B82F6` | role ∈ {owner, admin} | `/marketplace` |

### Group D — Atur (settings & help)

| Menu | Route | Icon color | Gate | Existing |
|---|---|---|---|---|
| **Branding** | `/branding` | `#FD7A5C` | always (per-USER) | NEW (firm req) — full CSS tokens + logo + favicon + custom CSS, live preview, reset to Coral Sunset |
| Panduan | `/documentation` | `#6B7280` | always | `/documentation` |
| Use Case | `/use-case` | `#A3A3A3` | always | `/use-case` |
| Pengaturan | `/settings/*` | `#6B7280` | always (sub-items role-gated) | `/settings`, `/team`, `/ai`, `/mailboxes`, `/billing`, `/compliance(+dsar)`, `/handoff`, `/knowledge-base`, `/extension`, `/diagnostics` |
| Superadmin | `/admin` | `#0F172A` | role = Superadmin | `/admin` (separate console; never user-themed) |

**What changed vs. old sidebar (the de-tangling):**
- The old **"Riset Prospek" = `/pipeline`** mislabel is gone; pipeline is just **Pipeline**, and **Enrichment is its own top-level item** (was hidden as a `/contacts/discovery` tab — fixes the "where is enrichment?" complaint).
- The old `/contacts` (which only listed workspaces) is **deleted**; **Kontak** now means the real contacts table (the old `/contacts/profiles`).
- `/contacts/map` and `/workspace/[contactId]` fold **into Kontak** (Peta = a tab; single-contact = the right-drawer/cockpit). `/escalations` folds into **Inbox** as a filter. `/ai-assistant` is the drawer. Two redundant sub-navs (`ContactsTabs` + `ContactsSubnav`) are replaced by **one** in-page tab row.

---

## 2. The core spine (one mental model)

```
Onboarding ─▶ Workspace (1 ws = 1 produk) ─▶ Discovery + Enrichment ─▶ Kontak (B2C/B2B) ─▶ Inbox (WA) ─▶ Pipeline
   (tenant)        (the home of the flow)        (find · enrich · classify)   (segmented, scored)   (chat)    (deal)
```

Two ways to reach every step, by design (this is what kills "aneh"):
- **Global** — each step is a **sidebar item** (Workspace, Kontak, Enrichment, Inbox, Pipeline) for users who want the cross-workspace view.
- **Scoped** — each step is also an **inline panel inside the Workspace hub**, pre-filtered to `?workspace=<id>`. The workspace is a guided 1→6 stepper; the sidebar items are the same surfaces unscoped.

> A contact acquired in a workspace is the **same row** you see in global Kontak — just filtered. No duplicate "leads here vs contacts there" split. The `workspaceId` tag on a person is the single source of truth (already exists: `/api/profiles/workspace`).

---

## 3. Step-by-step flow + WHERE B2C/B2B and Enrichment live

### Step 0 — Onboarding (tenant grain)
`register → pending → superadmin activate → /onboarding (vertical → branding → team → done) → /dashboard`.
Vertical sets `enabled_modules`; **branding step writes the per-USER theme** (defaults to Coral Sunset). Unchanged from `02-ia-flows.md`; included so the spine is complete.

### Step 1 — Workspace = 1 product (the home)
`/workspaces` (card list, create drawer) → `/workspaces/[id]` hub. The hub is a **numbered stepper**:

```
[ Workspace: "Paket MICE Hotel X" · 1 produk ]              ← header: product, owner, lead count, B2C/B2B mix bar
 1 ▸ Produk          (pick/confirm the single product)
 2 ▸ Market-Fit      → AI: marketType = B2B | B2C | mix  +  ICP  +  per-channel discovery playbook
 3 ▸ Discovery       (inline add-lead + "Buka Enrichment lengkap →")
 4 ▸ Enrichment      (inline: enrich + classify the leads just found)   ← NEW inline surface
 5 ▸ Sales Script    (alur · adab · 17 teknik closing · materi)
 6 ▸ Inbox / Chat    (WA conversation with this workspace's contacts)
 ── Kontak (segmented) ──   B2C / B2B / Belum tabs + scored table   ← THE acquired-contacts view, in the workspace
 ── Lainnya ──   Cadence · Pipeline (scoped to this workspace)
```

**WHERE B2C/B2B is shown (workspace):**
- **Step 2 Market-Fit** classifies the *product/market* as **B2B / B2C / mix** (`analyzeMarketFit`) — a colored verdict chip + a per-channel playbook that already branches B2B→LinkedIn/Google vs B2C→Instagram/TikTok/Shopee.
- The **header carries a B2C/B2B mix bar** (e.g. `12 B2C · 5 B2B · 3 belum`) so segmentation is visible the moment you open the workspace.
- The **"Kontak (segmented)" panel** at the bottom of the hub is the acquired-contacts list **with B2C / B2B / Belum diklasifikasi tabs + a badge per row** (reusing the existing `LeadTypeBadge`: B2C Customer = teal, B2B Partner = blue). This is the direct answer to *"Workspace must show acquired contacts WITH B2C vs B2B segmentation."*

**WHERE Enrichment lives + how it's reached (workspace):**
- **Step 4 "Enrichment"** is a first-class step in the stepper (not buried). It shows the workspace's still-thin leads with a **"Enrich + Klasifikasi" action** (bulk + per-row), driving `/api/profiles/enrich` (gender, email/HP/website/socials via websearch, FORD profile, summary) and `/api/profiles/classify` (B2C/B2B). A progress modal shows `done/total` (UX bar: async needs progress).
- A clear link **"Buka Enrichment lengkap →"** jumps to the global `/enrichment?workspace=<id>` for the full engine.

### Step 2 — Discovery + Enrichment (find · enrich · classify)
**`/enrichment`** is the merged, promoted surface (today's `/contacts/discovery` engine + the bulk enrich/classify buttons currently stranded in `/contacts/profiles`). One page, three stacked sections:

```
/enrichment   (sidebar item #4 — easy to reach; ?workspace= optional scope)
 ┌ A. Temukan (Discovery)  — Extension (utama) · Server crawl (URL/Hunter) · AI "cari orang per-bidang" plan
 ├ B. Perkaya (Enrich)     — bulk "Cari kontak & profil (web)" queue, per-row enrich, data-quality bar
 └ C. Klasifikasi          — "Klasifikasi semua" → sets leadType B2C/B2B; shows B2C/B2B/Belum counts
   Riwayat crawl + job detail (existing)
```

**WHERE B2C/B2B is shown (enrichment):** Section C is literally the classifier; results badge each row B2C/B2B and update the counts. This is the "clear, easy-to-reach Enrichment surface" the user asked for — now a **named sidebar item**, not a hidden tab.

### Step 3 — Kontak (segmented · scored · enriched)
**`/contacts`** (the real one, today's `/contacts/profiles` content) — CRUD-one-page, right-drawer detail:

```
/contacts
 Tabs:  [ Orang ] [ Perusahaan ] [ Peta ]                  ← Peta absorbs /contacts/map
 Within Orang:  segment chips → [ Semua | B2C | B2B | Belum ]   ← B2C/B2B segmentation (filter + per-row badge)
 Columns: Nama · Jabatan · Perusahaan · TIPE(badge) · Lokasi · Kontak · Skor · Sumber · Sales · Workspace
 Row click → right drawer (Sainskerta Rule 5): profile, contact points (WA/email), enrich button, assign, deal
 Toolbar: search · source filter · "Enrich (web)" · "Klasifikasi semua"  ← enrichment reachable here too
```

This is where the **acquired, enriched, scored, B2C/B2B-segmented** contacts live globally; inside a workspace the same table renders pre-filtered by `workspaceId`.

### Step 4 — Inbox (WA conversation)
**`/inbox`** + `/inbox/[id]` — omni-channel thread list + conversation (WA/email/IG), contact panel, handoff. `/escalations` (AI replies to review) becomes an **Inbox filter** "Perlu ditinjau" rather than a separate destination.

### Step 5 — Pipeline (deal)
**`/pipeline`** — kanban by stage (prospek → kualifikasi → penawaran → negosiasi → tutup) + the AI deal-scoring table (`enrichment-table`, `EnrichmentDealAnalysis`: priorityScore, temperature, matched products). Card → deal right drawer. Reachable globally and scoped from the workspace "Lainnya" row.

---

## 4. Wireframes to produce (low-fi, this iteration)

Per REVISI, add core-product wireframes (grayscale, layout + flow only):

1. `wireframes/workspace-hub.html` — the 1→6 stepper + header mix bar + segmented Kontak panel.
2. `wireframes/contacts.html` — Orang/Perusahaan/Peta tabs, **B2C/B2B segment chips + badges**, right-drawer.
3. `wireframes/enrichment.html` — Discovery + Enrich + Classify sections (the named surface).
4. `wireframes/inbox.html` — thread list + WA conversation + handoff/review filter.
5. `wireframes/pipeline.html` — kanban + deal score table + deal drawer.
6. `wireframes/branding.html` — per-USER theme tokens + logo/favicon + custom CSS + live preview + reset.
7. Update `wireframes/index.html` to link the new pages into the clickable flow.

**Audit checklist for each:** clear nav, single purpose, right-drawer for create/edit, one tab row (no double sub-nav), B2C/B2B visible where contacts appear, Enrichment one click from the sidebar, loading/empty/error placeholders.

---

## 5. Decisions recorded (write back to `architecture-decisions.md`)

- IA spine = **Workspace-home + global/scoped duality**; sidebar regrouped into Utama / Jangkau-Closing / Pasca-jual-Lapangan / Atur. Nothing from `app/(app)/**` dropped — only regrouped/merged.
- **Enrichment promoted to a top-level sidebar item** `/enrichment` (merges discovery engine + bulk enrich/classify).
- **Old `/contacts` (workspace-list) deleted; `/contacts` now = the real contacts table** (ex-`/contacts/profiles`); `/contacts/map`→tab, `/workspace/[contactId]`→drawer, `/escalations`→Inbox filter, `/ai-assistant`→drawer.
- **B2C/B2B segmentation surfaced in 3 places:** workspace header mix bar, workspace "Kontak (segmented)" panel (tabs+badges), and global `/contacts` segment chips + Enrichment classifier. Reuses existing `leadType` + `LeadTypeBadge` + `analyzeMarketFit.marketType`.
- **Branding `/branding`** added to sidebar (per-USER grain, default Coral Sunset).
```
