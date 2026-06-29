# 04 — Feature Inventory (CURRENT app) → Rebuild Module Mapping

> Purpose: capture **every** feature of the existing prototype so nothing is dropped in the
> greenfield rebuild (REVISI feedback: "Pakai SEMUA fitur existing — inventarisir app sekarang,
> jangan ada fitur yang ilang"). Source of truth: `app/**/page.tsx` (53 pages), `app/api/**/route.ts`
> (~95 endpoints), `components/layout/side-nav.tsx`, `components/contacts/contacts-subnav.tsx`,
> `components/settings/settings-nav.tsx`, `lib/db/schema.ts` (~50 tables), `messages/id.json`.
>
> Status: derived from code, not aspirational. "Grain" column = entitlement/theme scope per
> `architecture-decisions.md` (entitlements = TENANT; theme/branding = USER).

---

## 0. How the current app is wired (so we don't lose the IA intent)

The existing sidebar (`side-nav.tsx`) already groups nav into **Utama / Fitur lain (collapsed) /
Atur**, with the **Workspace as the primary "Alur"** (produk → market-fit → discovery → script →
chat, all inline in one hub) and a global **⌘K command palette**. Settings is **one surface with a
sub-nav** (10 sections). Contacts is a **4-step sub-flow** (Cari → Hasil → Sebaran → Kelola).
Modules can be hidden per tenant via `tenant_entitlement` (`/api/tenant/entitlements` → `disabled[]`),
and some items are `managerOnly` (hidden from Sales Rep). **Keep all of this in the rebuild IA.**

---

## 1. AUTH / TENANT / ONBOARDING / ADMIN  *(Rebuild Module: `auth` + `tenant` + `admin`)*

| Page / Surface | Route | Key features | Grain |
|---|---|---|---|
| Marketing landing | `/(marketing)` | Hero, features, pricing (`messages.landing/features/pricing`) | public |
| Login | `/login` | Email/password (next-auth), demo accounts | public |
| Register | `/register` | Public signup → tenant `pending` (success state "Akun dibuat") | public |
| Pending | `/pending` | "Menunggu aktivasi" gate until superadmin activates | tenant |
| Accept invite | `/invite/[token]` | Join tenant via invite token | tenant |
| **Superadmin Console** | `/admin` | List tenants, **activate** (set durasi/until + kuota), **suspend**, create accounts, reset password, **EntitlementMatrix** (enable/disable modules per tenant), **DeploymentModeToggle**, **WA-mode toggle** | platform |
| Onboarding | *(API only today: `/api/tenant/onboarding`)* | **Pick vertical/usage** (HR/Sales/other) → sets active modules + entitlements; white-label step (per REVISI must become a real page) | tenant |

APIs: `auth/register`, `auth/[...nextauth]`, `tenant/status`, `tenant/onboarding`, `tenant/entitlements`,
`tenant/integration-token`, `admin/users`, `admin/users/password`, `admin/entitlements`,
`admin/deployment-mode`, `admin/wa-mode`, `invites/[token]`, `tenant/invites/[id]`.

---

## 2. BRANDING / THEME  *(Rebuild Module: `branding` — NEW first-class page)*

| Feature | Notes | Grain |
|---|---|---|
| `/branding` page | Edit **all** color tokens (full `:root` HSL set, not just primary), **logo**, **favicon**, optional **Custom CSS**; reset-to-default + **live preview**; default = Coral Sunset | **USER** |

> Not yet a page in the current app (theme is global Coral Sunset in `globals.css`). REVISI + ADR
> require it as a per-user surface. Listed here so the rebuild treats it as a required module.

---

## 3. DASHBOARD & REPORTING  *(Rebuild Module: `dashboard` + `reports`)*

| Page | Route | Key features | Grain |
|---|---|---|---|
| Dashboard | `/dashboard` | Daily summary: KPIs, tasks, funnel | tenant/user |
| Laporan | `/reports` | Performance & analytics | tenant |

---

## 4. WORKSPACE (the "Alur" / closing-flow hub)  *(Rebuild Module: `workspaces` — CORE)*

> **1 workspace = 1 product.** The hub is a numbered, gated 5-step inline flow.

| Page | Route | Key features | Grain |
|---|---|---|---|
| Workspace list | `/workspaces` | List/create workspaces; types: `lead_gen`, `partner`, `offering`, `retention`, `custom` | tenant |
| **Workspace hub** | `/workspaces/[id]` | Stepper: **1 Produk → 2 Market-Fit → 3 Discovery (cari kontak) → 4 Sales Script → 5 Eksekusi (chat lead inline)**; lead list with `leadType` (B2C/B2B); archive (soft-delete) | tenant |
| Sub-panels | *(components)* | `MarketFitPanel`, `SalesPlayPanel`, `WorkspaceDiscoveryPanel`, `WorkspaceChatPanel` | tenant |
| Workspace contact view | `/workspace/[contactId]` | Single-contact closing workspace (per-contact chat/closing) | tenant |

> **REVISI ask:** the Workspace must visibly show **acquired contacts WITH B2C vs B2B
> segmentation** (badge/tab/filter). The data already exists (`leadType` = `b2c_customer` /
> `b2b_partner`); surface it on the hub.

APIs: `workspaces`, `workspaces/[id]`, `workspaces/[id]/market-fit`, `workspaces/[id]/sales-play`,
`market-fit`, `profiles/workspace`.

---

## 5. CONTACTS / CRM + ENRICHMENT  *(Rebuild Module: `crm` + `enrichment`)*

> 4-step contacts sub-flow (`contacts-subnav.tsx`): **Cari → Hasil → Sebaran → Kelola.**
> CRM is the new first-class module (contacts/companies/deals/activities).

| Page | Route | Key features | Grain |
|---|---|---|---|
| Discovery (Cari) | `/contacts/discovery` | RPA crawl/discovery to find leads; plan + classify | tenant |
| Profiles (Hasil) | `/contacts/profiles` | People & companies; **B2C Customer / B2B Partner badges**; **ENRICHMENT** (gender-from-name + websearch for email/phone/website/socials), bulk sequential enrich queue, classify, assign to rep, promote profile→contact | tenant |
| Map (Sebaran) | `/contacts/map` | Province distribution map of profiles | tenant |
| Contacts (Kelola) | `/contacts` | Contact list + outreach; CRUD + send | tenant |
| Prospecting | `/prospecting` | Prospect sourcing (redirect/entry per recent commits) | tenant |
| **Riset Prospek** | `/pipeline` | **AI-enriched prospect data** (EnrichmentTable + AiAnalysisPanel), Kanban deals board, temperature (panas/aktif), product & price manager | tenant |

> **REVISI ask (Enrichment):** enrichment must have a **clear, easy-to-reach surface.** Today it's
> split across `/contacts/profiles` (per-row + bulk enrich) and `/pipeline` ("Riset Prospek").
> Rebuild should give Enrichment/Discovery one obvious home in the IA.
>
> **B2C vs B2B** lives in the data model: `person.leadType` / lead `leadType` = `b2c_customer`
> | `b2b_partner` (badges already rendered). `company` table backs B2B.

APIs: `discovery/plan`, `discovery/classify`, `profiles/enrich`, `profiles/classify`,
`profiles/assign`, `profiles/update`, `profiles/stale`, `profiles/by-province`,
`profiles/to-contact`, `profiles/workspace`, `db/contacts`, `db/companies`, `db/people`,
`db/deals`, `db/positioning`, `contacts/send`, `tenant/contacts/validate`, `ingest`, `data/archive`.
DB: `person`, `company`, `contact_point`, `contacts`, `deals`, `crawl_job`, `ingest_batch`,
`positioning_insight`.

---

## 6. INBOX / OMNI-CHANNEL / WHATSAPP  *(Rebuild Module: `inbox` + `wa-gateway`)*

| Page | Route | Key features | Grain |
|---|---|---|---|
| Inbox | `/inbox` | Omni-channel conversations (WA, email, IG) | tenant/user |
| Conversation | `/inbox/[id]` | Thread view, reply, AI draft | tenant/user |
| Escalations | `/escalations` | AI replies needing human review | tenant |

APIs: WhatsApp gateway (`wa/session`, `wa/status`, `wa/send`, `wa/draft`, `wa/mode`,
`wa/gateway/{qr,status,inbound,outbox}`, `wa/waha/inbound`), `db/conversations`, `db/messages`,
`draft-message`, `auto-reply`, `engagement/auto-reply`(+`/resolve`), `engagement/upsell`, `chat`.

---

## 7. ENGAGEMENT / OUTREACH / CONTENT  *(Rebuild Module: `cadences` + `content` + `quotes`)*

| Page | Route | Key features | Grain |
|---|---|---|---|
| Cadence list | `/cadences` | Automated multi-channel message sequences | tenant |
| Cadence builder | `/cadences/new`, `/cadences/[id]` | Steps, enrollment, processing | tenant |
| Autopilot | `/autopilot` | Full AI pipeline in one click (badge "AI") | tenant |
| Konten | `/content` | Create & schedule content | tenant |
| Penawaran (Quotes) | `/penawaran`, `/penawaran/[id]` | Compose, send & track quotes/proposals | tenant |
| Public quote | `/q/[token]` | Customer-facing quote view (public) | public |
| AI Assistant | `/ai-assistant` | Standalone AI assistant page (also docked in sidebar) | user |

APIs: `cadences`, `cadences/process`, `db/cadences`(+`/[id]`), `db/cadence-enrollments`,
`autopilot/text`, `db/autopilot-runs`, `quotes`(+`/[id]`,`/[id]/send`,`/compose`), `public/quote/[token]`,
`draft-message`, `tenant/sends`.

---

## 8. POST-SALE: RETENTION & E-COMMERCE  *(Rebuild Module: `retention` + `ecommerce`)*

| Page | Route | Key features | Grain |
|---|---|---|---|
| Retensi | `/retention`, `/retention/[flowId]` | Retention flows; keep/win-back customers | tenant |
| E-Commerce | `/ecommerce` | Marketplace orders + abandoned-cart recovery | tenant |

APIs: `engagement/upsell`, `engagement/event` (DB `engagement_event`), `auto_reply_event`.

---

## 9. TEAM / FIELD / MOBILE  *(Rebuild Module: `team` + `field`)*

| Page | Route | Key features | Grain |
|---|---|---|---|
| Monitoring Sales | `/team` | Manager view: active reps, closings, leads (managerOnly) | tenant |
| Sales Lapangan | `/field`, `/field/visits` | Field-team map + visit logging | tenant |
| Mobile shell | `/m`, `/m/contacts`, `/m/check-in`, `/m/visits/new` | Field rep mobile pages (home, contacts, check-in, new visit) | user |

APIs: `team/members`, `team/monitoring`, `rep/account`, `tenant/members`(+`/[id]`),
`sales/readiness`, `sales/calibration`, `sales/outcome`.

---

## 10. MARKETPLACE (data exchange)  *(Rebuild Module: `marketplace`)*

| Page | Route | Key features | Grain |
|---|---|---|---|
| Marketplace Data | `/marketplace` | Buy/sell company data across tenants (managerOnly); publish, acquire, bundle, delist | tenant |

APIs: `marketplace`, `marketplace/{publish,acquire,bundle,delist}`. DB: `marketplace_listing`, `pool_optout`.

---

## 11. AI PROVIDER / KNOWLEDGE / DIAGNOSTICS  *(Rebuild Module: `ai-core` + `kb`)*

| Surface | Route | Key features | Grain |
|---|---|---|---|
| Sales Assistant | sidebar dock + `/ai-assistant` | Consultative AI chat (closing methodology) | user |
| Knowledge Base | `/settings/knowledge-base` | KB docs feeding AI (Superadmin) | tenant |
| Handoff AI | `/settings/handoff` | AI→human handoff config (Superadmin) | tenant |
| Diagnostics | `/settings/diagnostics` | System/AI ping diagnostics (Superadmin) | platform |

APIs: `chat`, `db/kb`, `kb-test`, `tenant/ai`, `tenant/ai/credentials`, `diagnostics`,
`diagnostics/ai-ping`. DB: `kb`, `ai_provider`, `ai_model`, `ai_credential`, `tenant_active_model`,
`ai_usage`, `credit_grant`. Provider: DeepSeek default, Anthropic BYOK.

---

## 12. SETTINGS (one surface, 10 sections)  *(Rebuild Module: `settings`)*

`settings-nav.tsx` sections (routes stay; active derived from pathname; role-gated):

| Section | Route | Roles | Grain |
|---|---|---|---|
| Akun & Profil | `/settings` | all | user |
| Tim & Akses | `/settings/team` | all | tenant |
| Mailbox | `/settings/mailboxes` | all (OAuth + ESP webhook) | tenant |
| AI & Model | `/settings/ai` | all | tenant |
| Billing & Kuota | `/settings/billing` | all (Stripe checkout/portal/webhook, plan, subscription, payment-link) | tenant |
| Kepatuhan (PDP) | `/settings/compliance`, `/settings/compliance/dsar` | Superadmin/Admin/Manager (consent_log, DPIA, vendor_risk, DSAR, suppression, unsubscribe, pool-optout) | tenant |
| Extension | `/settings/extension` | all (extension connection/heartbeat/status) | tenant/user |
| Knowledge Base | `/settings/knowledge-base` | Superadmin | tenant |
| Handoff AI | `/settings/handoff` | Superadmin | tenant |
| Diagnostics | `/settings/diagnostics` | Superadmin | platform |

Also standalone: `/unsubscribe` (public). APIs: `tenant/mailboxes`(+`/esp`), `mailboxes/oauth/...`,
`esp/webhook`, `tenant/billing`, `billing/{checkout,portal,webhook,payment-link}`,
`tenant/compliance`, `compliance/pool-optout`, `unsubscribe`, `extension/{status,heartbeat}`,
`tenant/members`. DB: `subscription`, `plan`, `consent_log`, `dpia`, `vendor_risk`, `suppression`,
`consent`, `sending_account`, `email_template`, `send_job`, `extension_connection`, `wa_session`.

---

## 13. HELP / DOCUMENTATION  *(Rebuild Module: `help`)*

| Page | Route | Key features |
|---|---|---|
| Panduan | `/documentation` | How-to per feature |
| Use Case | `/use-case` | Sales/marketing scenarios per industry/vertical |

---

## Rebuild module map (consolidated)

`auth` · `tenant` · `admin` (superadmin console) · `branding` (per-user, NEW page) ·
`onboarding` (vertical/white-label) · `dashboard` · `reports` · **`workspaces`** (closing-flow hub,
1ws=1product, B2C/B2B on leads) · **`crm`** (contacts/companies/deals/activities) ·
**`enrichment`** (discovery + profiles enrich — needs one clear home) · `inbox` · `wa-gateway` ·
`escalations` · `cadences` · `autopilot` · `content` · `quotes` · `retention` · `ecommerce` ·
`team` · `field` (+ mobile) · `marketplace` · `ai-core` · `kb` · `settings` · `help`.

**Build order (per ADR M1→…):** `auth/tenant/onboarding/admin/branding` → `workspaces+product` →
`crm/enrichment (B2C/B2B + discovery)` → `inbox/wa` → everything else (`cadences/autopilot/content/
quotes/retention/ecommerce/team/field/marketplace/reports/settings`).

**Cross-cutting (every module):** soft-delete + restore, ⌘K command palette, entitlement gating
(tenant), managerOnly role gating, per-user branding, i18n (id default / en), right-drawer CRUD.
