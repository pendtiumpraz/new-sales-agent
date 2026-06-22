# Workflow-coherence audit — Jun 2026

Audit of every screen against the intended **workspace-centric closing-flow**
(login → /workspaces → produk → market-fit → discovery → script → chat; WA via
WAHA per-account; inbox readiness + outcome; reports calibration). Done by 4
parallel reviewers across the whole app. `[x]` = fixed.

## Fixed
- [x] ⌘K command palette: Workspace promoted to primary; retired `/contacts/{profiles,discovery,map}` deep links dropped; "Hubungkan WhatsApp/Extension" added; manager-only items filtered for reps. (`command-palette.tsx`)
- [x] Onboarding checklist: first-lead step → `/workspaces` (was `/contacts/discovery`). (`onboarding-checklist.tsx`)
- [x] Documentation: Inbox card → `/inbox` (was `/contacts?view=inbox`). (`documentation/page.tsx`)
- [x] Calibration dashboard: per-workspace filter + Brier score. (`calibration-panel.tsx`)
- [x] **Marketplace security**: all 5 APIs → `tenant.members.manage`; page renders a "Khusus manajer" gate for reps. (`marketplace/page.tsx`, `api/marketplace/**`)
- [x] **Autopilot demoted**: dashboard CTA + topbar coral CTA now → `/workspaces`; Autopilot stays in sidebar + ⌘K. (`dashboard/page.tsx`, `side-nav.tsx`)
- [x] Workspace hub "Lainnya": dropped retired `/contacts/profiles` tile (kept scoped Cadence + Riset Prospek). (`workspaces/[id]/page.tsx`)
- [x] Inbox ContactPanel: "Lihat di Kontak" → "Buka Workspace" `/workspaces`. (`contact-panel.tsx`)
- [x] Use-case + prospecting-panel: "real leads / get started" → `/workspaces`. 
- [x] Profile dropdown: removed duplicate "Profil" item.
- [x] Retention/E-Commerce: honest demo labels; Retention store reset on logout (no cross-tenant bleed). Full DB-backed per-tenant scoping still open (below).
- [x] **Docs rewrite**: added a primary "Workspace (alur jualan)" category + "Hubungkan WhatsApp" (WAHA/extension) entry; reframed "Akuisisi Lead" blurb (leads are per-workspace). (`documentation/page.tsx`)
- [x] **Inbox right rail**: HandoffPanel now also gated on `inboxPanelOpen`, so the header toggle hides the WHOLE rail (was leaving a 320px panel); tooltip → "panel kanan". (`handoff-panel.tsx`, `message-thread.tsx`)
- [x] **Marketplace naming**: "Marketplace Kontak" → "Marketplace Data" across headers; copy no longer claims it sells "orang" (people aren't sold). (`marketplace/page.tsx`)
- [x] **Inbox list readiness**: compact `ReadinessDot` (band color) per row, same engine as the thread badge. (`readiness-dot.tsx`, `conversation-list.tsx`)
- [x] **Login brand**: wordmark "Agentic Sales" → "Maira Sales"; dead "Lupa sandi?" `href="#"` → button with a "hubungi superadmin" toast. (`login/page.tsx`)
- [x] **Extension settings wording**: title → "Extension Maira — WhatsApp & Discovery"; step-6 lead destination → workspace (was "Kontak → Profil"). (`settings/extension/page.tsx`)

## HIGH — remaining
- [ ] **Autopilot is still off-model (deeper).** Now demoted in nav, but it's still a LinkedIn connect→DM pipeline with zero workspace/product awareness. Optional bigger reframe: make it a WA-channel batch-runner over workspace leads, or clearly label it a separate top-of-funnel tool. (`autopilot/**`, `lib/autopilot/**`)
- [ ] **Old singular `/workspace/[contactId]` route** (UnifiedWorkspace, contacts-centric workbench) still live. Decide: redirect → `/workspaces`, delete, or keep as a distinct per-contact workbench (then stop calling it retired). (`app/(app)/workspace/[contactId]/`)

## MED — remaining
- [ ] Retention + E-Commerce: real DB-backed per-tenant data source (currently demo-labeled mock; cross-tenant bleed fixed on logout). Bigger task.
- [ ] WA connect card exposes tenant `per-sales`/`per-platform` mode; per-platform lets only a manager link ONE shared number — contradicts per-account (1 QR each). Standardize/clarify. (`wa-connect-card.tsx`, `wa/session/route.ts`)
- [ ] Content: no workspace/product binding + hardcoded demo clock (`NOW=2026-05-25`) → stale KPIs/date floor. (`content/page.tsx`)
- [ ] Cadence enrollment is contact-centric (`/api/db/contacts`, "Daftarkan kontak") — source from workspace leads instead. (`cadences/[id]/page.tsx`)
- [ ] Extension settings: surface the WhatsApp `WaConnectCard` as its own top section (currently buried mid-page below the LinkedIn collector). (`settings/extension/page.tsx`)
- [ ] Pipeline: one feature, four names (nav "Riset Prospek", route `/pipeline`, subtitle "enrichment", hub tile "Pipeline"). Unify. 
- [ ] Workspace stepper numbering inconsistent between hub `FlowStep` and `MarketFitPanel` StepDots. Use one 1→5 scheme.

## LOW — remaining
- [ ] Mobile tab bar has "Kontak" → `/m/contacts` but no `/m/workspaces` — mobile never reaches the primary flow. (`mobile-tab-bar.tsx`)
- [ ] Field visits link rep→visits by display NAME (brittle); use a stable id. (`field/visits/page.tsx`)
- [ ] Content tabs lack an onboarding empty state.
