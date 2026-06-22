# Workflow-coherence audit — Jun 2026

Audit of every screen against the intended **workspace-centric closing-flow**
(login → /workspaces → produk → market-fit → discovery → script → chat; WA via
WAHA per-account; inbox readiness + outcome; reports calibration). Done by 4
parallel reviewers across the whole app. `[x]` = fixed.

## Fixed in this pass
- [x] ⌘K command palette: Workspace promoted to primary; retired `/contacts/{profiles,discovery,map}` deep links dropped; "Hubungkan WhatsApp/Extension" added; manager-only items filtered for reps. (`command-palette.tsx`)
- [x] Onboarding checklist: first-lead step → `/workspaces` (was `/contacts/discovery`). (`onboarding-checklist.tsx`)
- [x] Documentation: Inbox card → `/inbox` (was `/contacts?view=inbox`). (`documentation/page.tsx`)
- [x] Calibration dashboard: per-workspace filter + Brier score. (`calibration-panel.tsx`)

## HIGH — remaining
- [ ] **Marketplace manager-only LEAK (security).** Page has no client role guard; `/api/marketplace*` guards are only `data.read` (members hold it). A rep at `/marketplace` (direct URL) can browse/acquire/publish cross-tenant company data. **Fix:** manager-gate the page (like `/team`) + raise acquire/publish/delist API guards to `tenant.members.manage`. (`app/(app)/marketplace/page.tsx`, `app/api/marketplace/**`)
- [ ] **Autopilot over-prominence + off-model.** Dashboard's primary CTA is "Mulai Autopilot" (not Workspace); a permanent coral topbar CTA sits on every page; Autopilot is a LinkedIn connect→DM pipeline with zero workspace/product awareness; badges inconsistent ("Baru" vs "AI"). **Fix (quick):** dashboard primary CTA → `/workspaces`; soften/relabel the topbar CTA. **Fix (bigger):** reframe Autopilot as a WA-channel batch-runner over workspace leads, or clearly label it a separate top-of-funnel tool. (`dashboard/page.tsx:255`, `side-nav.tsx:372-407`)
- [ ] **Old singular `/workspace/[contactId]` route** (UnifiedWorkspace, contacts-centric workbench) still live. Decide: redirect → `/workspaces`, delete, or keep as a distinct per-contact workbench (then stop calling it retired). (`app/(app)/workspace/[contactId]/`)
- [ ] **Docs describe the OLD funnel.** Headline category is "Akuisisi Lead" (Discovery→Profil→Enrichment); NO entry for the Workspace closing-flow or WhatsApp/WAHA connect. New users learn the wrong flow. **Fix:** add a primary "Workspace (alur jualan)" doc + a WhatsApp/Extension connect doc. (`documentation/page.tsx`)

## MED — remaining
- [ ] Workspace hub "Lainnya" tiles link to `/contacts/profiles`, `/cadences`, `/pipeline` — pull the rep back out of the workspace. Repoint to scoped/in-workspace views or drop. (`workspaces/[id]/page.tsx:219`)
- [ ] Inbox ContactPanel CTAs: "Lihat di Kontak" → `/contacts` (dead-ends in the funnel), "Tambahkan ke cadence" → `/cadences`. Repoint "Lihat di Kontak" → the lead's workspace. (`contact-panel.tsx:99`)
- [ ] Inbox detail shows TWO stacked 320px right panels (Handoff + Contact); the header toggle only hides ContactPanel. Gate both behind the toggle, or merge into tabs. (`inbox/[id]/page.tsx`, `handoff-panel.tsx`)
- [ ] Inbox list rows show no readiness/outcome — surface a compact `ReadinessBadge`/dot per row. (`conversation-list.tsx`)
- [ ] Retention + E-Commerce float outside tenant/workspace scoping; Retention uses a **cross-tenant** persisted Zustand store. Scope per tenant. (`retention/page.tsx`, `lib/stores/retention-store.ts`, `ecommerce/page.tsx`)
- [ ] E-Commerce: hardcoded "Terhubung" channels render real revenue/counts with no demo caveat on the card. (`ecommerce/page.tsx:42`)
- [ ] WA connect card exposes tenant `per-sales`/`per-platform` mode; per-platform lets only a manager link ONE shared number — contradicts per-account (1 QR each). Standardize/clarify. (`wa-connect-card.tsx`, `wa/session/route.ts`)
- [ ] Content: no workspace/product binding + hardcoded demo clock (`NOW=2026-05-25`) → stale KPIs/date floor. (`content/page.tsx`)
- [ ] Cadence enrollment is contact-centric (`/api/db/contacts`, "Daftarkan kontak") — source from workspace leads instead. (`cadences/[id]/page.tsx`)
- [ ] Marketplace self-contradictory naming ("Marketplace Kontak" vs "Data"; sells "orang" while logic forbids it). Pick "Marketplace Data" + fix copy. (`marketplace/page.tsx`)
- [ ] Profile dropdown: "Profil" and "Pengaturan" both → `/settings` (duplicate). (`side-nav.tsx:497-504`)
- [ ] Extension settings titled "Extension LinkedIn"; step-6 says leads land in "Kontak → Profil"; WhatsApp QR buried mid-page. Surface WA connect as its own section; fix wording. (`settings/extension/page.tsx`)
- [ ] Pipeline: one feature, four names (nav "Riset Prospek", route `/pipeline`, subtitle "enrichment", hub tile "Pipeline"). Unify. 
- [ ] Workspace stepper numbering inconsistent between hub `FlowStep` and `MarketFitPanel` StepDots. Use one 1→5 scheme.

## LOW — remaining
- [ ] Login wordmark "Agentic Sales" vs product "Maira Sales"; "Lupa sandi?" is a dead `href="#"`. (`login/page.tsx`)
- [ ] Mobile tab bar has "Kontak" → `/m/contacts` but no `/m/workspaces` — mobile never reaches the primary flow. (`mobile-tab-bar.tsx`)
- [ ] Field visits link rep→visits by display NAME (brittle); use a stable id. (`field/visits/page.tsx`)
- [ ] Content tabs lack an onboarding empty state.
- [ ] Use-case + prospecting-panel still link to `/contacts/discovery` as the entry. Repoint to `/workspaces`.
