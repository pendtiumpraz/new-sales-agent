# 02 — Information Architecture & Flows

> **Phase 02 (IA layer).** Rebuild of Agentic Sales AI (Maira Sales).
> Authoritative inputs: `user_requirement.md`, `architecture-decisions.md`,
> `loop-workflow/RULES-OF-THE-GAME.md`, `loop-workflow/standards/UI-UX-STANDARDS.md`,
> `loop-workflow/standards/SAINSKERTA-RULES.md`.
> This doc defines the **sitemap, sidebar navigation, page inventory per module,
> and the core flows**. It is the contract the wireframes/mockups (`wireframes/`,
> `mockups/`) and the eventual `modules/<domain>/` code must satisfy. No app code here.

---

## 0. Scope & ground rules (recap of firm decisions)

- **Stack:** Next.js 14 App Router full-stack, modular monolith `modules/<domain>/{schema,repo,service,api}`.
- **DB:** PostgreSQL/Drizzle (Neon). **No FK**, `snake_case` columns, soft-delete (`deleted_at` on every table), restore + trashed views.
- **Grain = tenant.** Activation, quota, entitlements, white-label, usage limits all scoped per tenant.
- **Multi-tenant + white-label:** each tenant has `primary_color`, `logo_url`, `brand_name` applied across the whole UI via CSS variables.
- **Vertical/usage-based onboarding:** tenant picks a vertical at onboarding (HR / Sales / Other) → sets `enabled_modules` + `entitlements`. The sidebar and routes are **gated** by these.
- **Activation flow:** public register → tenant `pending` → superadmin activates (duration + quota) → onboarding → dashboard.
- **CRM is first-class:** companies, contacts, deals, activities, pipeline.
- **AI:** multi-provider, default DeepSeek (Anthropic optional BYOK).
- **Sainskerta UI rules that drive this IA:**
  - CRUD-in-one-page (list + create + edit + delete + restore on one route).
  - Right-side drawer (400px) for every create/edit form.
  - Sidebar = **1 solid color icon per menu** (SVG inline, no gradient).
  - No hardcoded dummy data; every screen waits on a real API + has loading/empty/error states.

> **Module build order (firm):** **M1 Auth/Tenant/Onboarding** → M2 Workspace+Product → M3 Contacts/CRM → M4 Inbox/WA → M5 Enrichment. This doc inventories all of them so the IA is complete, but only **M1 is in immediate scope** for wireframe→mockup→code.

---

## 1. Three navigation surfaces

The app has **three distinct shells**, each with its own root and its own navigation. Keeping them separate prevents tenant UI and platform-operator UI from leaking into each other.

| Surface | Root | Who | Shell |
|---|---|---|---|
| **A. Public / Auth** | `/` , `/login`, `/register`, `/pending`, `/forgot`, `/reset`, `/onboarding` | Anonymous + newly-registered tenant owners | Centered card, no sidebar. Tenant theme **not yet** applied (uses Sainskerta default blue) until onboarding sets it. |
| **B. Tenant App** | `/app/**` | Activated tenant members (owner/admin/member) | Left sidebar (white-label themed) + topbar. Sidebar items gated by `enabled_modules` + role. |
| **C. Superadmin Console** | `/superadmin/**` | Platform operators only (cross-tenant) | Separate dark sidebar, **never** themed by any tenant (always Sainskerta neutral). Distinct visual identity so operators always know they are in the platform console. |

> Route-group note (App Router): implement as `app/(auth)/...`, `app/(app)/app/...`, `app/(superadmin)/superadmin/...`. The `/app` and `/superadmin` URL prefixes make middleware gating trivial.

---

## 2. Sitemap (full, all modules)

```
/                                   landing / marketing splash (public)
│
├── (AUTH — Surface A)
│   ├── /login
│   ├── /register                   public tenant signup (creates tenant=pending)
│   ├── /register/success           "check your email / awaiting activation"
│   ├── /pending                    tenant pending screen (logged-in owner, not yet active)
│   ├── /forgot                     forgot password
│   ├── /reset                      reset password (token)
│   └── /onboarding                 wizard (only after superadmin activation)
│       ├── /onboarding/vertical        step 1 — pick vertical/usage
│       ├── /onboarding/brand           step 2 — white-label (color, logo, brand name)
│       ├── /onboarding/team            step 3 — invite teammates (optional/skip)
│       └── /onboarding/done            step 4 — summary → enter dashboard
│
├── (TENANT APP — Surface B, prefix /app)
│   ├── /app                        dashboard (home, vertical-aware widgets)
│   │
│   ├── /app/workspaces             [M2] workspaces list (1 workspace = 1 product)
│   │   └── /app/workspaces/[id]    workspace detail / product config
│   ├── /app/products               [M2] product catalog (per workspace)
│   │
│   ├── /app/crm                    [M3] CRM hub (redirects to default tab)
│   │   ├── /app/crm/companies      companies CRUD-one-page
│   │   ├── /app/crm/contacts       contacts CRUD-one-page
│   │   ├── /app/crm/deals          deals list (CRUD-one-page)
│   │   ├── /app/crm/pipeline       deals as kanban board (pipeline view)
│   │   └── /app/crm/activities     activities timeline / log
│   │
│   ├── /app/inbox                  [M4] unified WA/chat inbox
│   │   └── /app/inbox/[threadId]   conversation thread
│   ├── /app/enrichment             [M5] lead enrichment / data quality
│   │
│   ├── /app/team                   tenant members & roles (CRUD-one-page)
│   ├── /app/settings               tenant settings hub
│   │   ├── /app/settings/brand     white-label editor (post-onboarding edits)
│   │   ├── /app/settings/modules   enabled modules / vertical (re-pick, gated by entitlements)
│   │   ├── /app/settings/ai         AI provider + BYOK keys
│   │   ├── /app/settings/billing    plan / quota usage (read-only in M1)
│   │   └── /app/settings/profile    current user's profile + password
│   └── /app/trash                  cross-module trashed items + restore (soft-delete UI)
│
└── (SUPERADMIN CONSOLE — Surface C, prefix /superadmin)
    ├── /superadmin                 platform overview (tenant counts, pending queue)
    ├── /superadmin/tenants         tenant list CRUD-one-page (activate/suspend/quota)
    │   └── /superadmin/tenants/[id]  tenant detail drawer content (or dedicated page)
    ├── /superadmin/pending         pending-activation queue (fast-path approve)
    ├── /superadmin/users           platform-level accounts (create operator/tenant-owner)
    ├── /superadmin/verticals       manage vertical → module-bundle definitions
    ├── /superadmin/audit           audit log (activations, suspensions, quota changes)
    └── /superadmin/trash           trashed tenants/users + restore
```

---

## 3. Sidebar navigation — 1 solid color icon per menu (Sainskerta Rule 6)

Each menu uses **one solid color, inline SVG, no gradient**. Hover = opacity 0.8; active = lighten 20%. Colors are drawn from the Sainskerta sidebar palette so they read clearly on the dark sidebar `#1E293B`.

> **Important white-label nuance:** the sidebar **background** and the **active-item highlight** follow the tenant's `primary_color`. The **per-menu icon colors below are fixed** (they are wayfinding aids, not brand). This keeps the "1 solid color per menu" rule intact even while the chrome is themed. (Decision recorded in §8.)

### 3.1 Tenant App sidebar (Surface B)

Order = top-to-bottom. `Gate` column = which `enabled_modules` flag / role must be present for the item to render.

| # | Menu (id) | Route | Icon | Color (hex) | Gate |
|---|---|---|---|---|---|
| 1 | Dashboard | `/app` | home | `#3B82F6` | always |
| 2 | Workspaces | `/app/workspaces` | grid/package | `#10B981` | `mod.workspace` |
| 3 | Products | `/app/products` | tag | `#F59E0B` | `mod.workspace` |
| 4 | CRM | `/app/crm` | contact-card | `#14B8A6` | `mod.crm` |
| 5 | Inbox | `/app/inbox` | chat-bubble | `#6366F1` | `mod.inbox` |
| 6 | Enrichment | `/app/enrichment` | sparkle/scan | `#8B5CF6` | `mod.enrichment` |
| 7 | Team | `/app/team` | users | `#EF4444` | role ∈ {owner, admin} |
| 8 | Settings | `/app/settings` | gear | `#6B7280` | always (sub-items role-gated) |
| 9 | Trash | `/app/trash` | trash | `#F97316` | role ∈ {owner, admin} |

CRM (#4) is a **section with a nested sub-nav** (rendered as a secondary nav inside the CRM hub, not as 5 top-level sidebar rows — keeps the sidebar short): Companies, Contacts, Deals, Pipeline, Activities.

### 3.2 Superadmin Console sidebar (Surface C) — never themed

| # | Menu | Route | Icon | Color (hex) |
|---|---|---|---|---|
| 1 | Overview | `/superadmin` | home | `#3B82F6` |
| 2 | Tenants | `/superadmin/tenants` | building | `#10B981` |
| 3 | Pending | `/superadmin/pending` | clock/hourglass | `#F59E0B` |
| 4 | Accounts | `/superadmin/users` | user-shield | `#EF4444` |
| 5 | Verticals | `/superadmin/verticals` | layers | `#8B5CF6` |
| 6 | Audit Log | `/superadmin/audit` | list-check | `#14B8A6` |
| 7 | Trash | `/superadmin/trash` | trash | `#F97316` |

---

## 4. Page inventory per module

Every CRUD page follows the **one-page pattern**: table (Active tab) + Trashed tab + "Tambah" button → right drawer for create, row click → same right drawer for edit, row delete → confirm → soft-delete, Trashed tab → restore. Each page must ship **loading / empty / error** states (Rule 7).

### Module 1 — Auth / Tenant / Onboarding (IMMEDIATE SCOPE)

| Page | Route | Type | Key elements |
|---|---|---|---|
| Landing | `/` | Static | Hero, CTA → register/login. Sainskerta default theme. |
| Login | `/login` | Form | email + password, "forgot?", link to register. Errors: bad creds, tenant suspended, tenant pending → redirect `/pending`. |
| Register | `/register` | Form | brand/company name, owner name, email, password. Creates `tenant` (status=`pending`) + owner `user`. → `/register/success`. |
| Register success | `/register/success` | Info | "Account created, awaiting activation by admin." |
| Pending | `/pending` | Status gate | Shown to a logged-in owner whose tenant is still `pending`/`suspended`. Polls status; auto-advances to `/onboarding` once activated. Sign-out. |
| Forgot password | `/forgot` | Form | email → send reset link. |
| Reset password | `/reset` | Form | token + new password. |
| Onboarding: Vertical | `/onboarding/vertical` | Wizard step | Pick **HR / Sales / Other**. Each card shows the modules it unlocks. Sets `vertical` + default `enabled_modules`. |
| Onboarding: Brand | `/onboarding/brand` | Wizard step | primary color picker, logo upload, brand name. **Live preview** of sidebar/buttons. Writes white-label. |
| Onboarding: Team | `/onboarding/team` | Wizard step | invite teammates (email + role). Skippable. |
| Onboarding: Done | `/onboarding/done` | Wizard step | Summary of vertical + enabled modules + quota/duration (from activation) → "Enter dashboard". |
| Dashboard shell | `/app` | Shell + home | Themed sidebar (gated), topbar (tenant switcher if multi, user menu), home widgets placeholder. This is the **shell all later modules mount into**. |

**Superadmin pages also belong to M1** (activation is the gate for the whole flow):

| Page | Route | Type | Key elements |
|---|---|---|---|
| Overview | `/superadmin` | Dashboard | counts: total/active/pending/suspended tenants; pending queue shortcut. |
| Tenants | `/superadmin/tenants` | CRUD-one-page | list all tenants; row drawer = activate/suspend, set **duration** (valid_until) + **quota** (limits), edit modules/vertical override. |
| Pending queue | `/superadmin/pending` | List + action | fast approve: set duration+quota in one drawer → status `active`. |
| Accounts | `/superadmin/users` | CRUD-one-page | create operator or pre-provision a tenant owner (create-account flow). |
| Verticals | `/superadmin/verticals` | CRUD-one-page | define vertical → module-bundle mapping that onboarding reads. |
| Audit log | `/superadmin/audit` | List (read) | who activated/suspended/changed-quota, when. |

### Module 2 — Workspace + Product (inventory only)
- `/app/workspaces` (CRUD-one-page), `/app/workspaces/[id]` (config), `/app/products` (CRUD-one-page, scoped to workspace). Rule: **1 workspace = 1 product**.

### Module 3 — Contacts / CRM (inventory only)
- `/app/crm/companies`, `/app/crm/contacts`, `/app/crm/deals` (all CRUD-one-page), `/app/crm/pipeline` (kanban of deals), `/app/crm/activities` (timeline). See §6 for navigation.

### Module 4 — Inbox / WA (inventory only)
- `/app/inbox` (thread list + active conversation), `/app/inbox/[threadId]`.

### Module 5 — Enrichment (inventory only)
- `/app/enrichment` (run/queue enrichment, data-quality view per contact/company).

### Cross-cutting (tenant)
- `/app/team`, `/app/settings/*`, `/app/trash` — present from M1's shell onward; sub-features fill in as modules ship.

---

## 5. FLOW (a) — Register → Pending → Superadmin Activate → Onboarding → Dashboard

```
[Anonymous]
   │  visits /register
   ▼
(1) REGISTER  /register
   - submit: brand_name, owner_name, email, password
   - service: create tenant {status:'pending', valid_until:null, quota:null}
              create user  {role:'owner', tenant_id}
              event: TenantRegistered → notify superadmin (pending queue)
   ▼
(2) /register/success  → "awaiting activation"
   │  (owner may log in immediately)
   ▼
(3) LOGIN  /login  → auth ok, but tenant.status = 'pending'
   - middleware: tenant not active → redirect to /pending
   ▼
(4) /pending  (logged-in owner, blocked from /app)
   - shows status; polls GET tenant status
   - sign-out available
   │
   │  ……… meanwhile, in parallel ………
   │
   ▼ (superadmin side, Flow b)
(5) SUPERADMIN activates tenant
   - /superadmin/pending → open drawer → set duration (valid_until)
     + quota (limits) → confirm
   - service: tenant.status = 'active', set valid_until + quota
              event: TenantActivated
   ▼
(6) /pending poll detects status='active'  → auto-redirect /onboarding
   - guard: if tenant.onboarded = false → onboarding; else → /app
   ▼
(7) ONBOARDING WIZARD
   step 1 /onboarding/vertical
      - pick HR | Sales | Other
      - service: tenant.vertical set; enabled_modules = bundle(vertical)
        (capped by superadmin entitlements — can't enable a module the plan forbids)
   step 2 /onboarding/brand
      - primary_color, logo_url, brand_name  → live preview
      - service: write white_label; theme tokens now resolvable
   step 3 /onboarding/team (skippable)
      - invite users (email + role) → pending invites
   step 4 /onboarding/done
      - summary; service: tenant.onboarded = true
   ▼
(8) DASHBOARD  /app
   - shell renders with tenant theme + gated sidebar (enabled_modules)
   - home widgets per vertical (placeholder in M1)
```

**Guards / edge cases**
- Direct hit on `/onboarding` while `status≠active` → bounce to `/pending`.
- Direct hit on `/app/**` while `onboarded=false` → bounce to `/onboarding`.
- `status='suspended'` or `valid_until` expired at any time → all `/app/**` bounce to `/pending` (with reason).
- Quota exceeded → action-level block (not route block) with upgrade hint; surfaced in `/app/settings/billing`.

---

## 6. FLOW (b) — Superadmin Console (activate / suspend / quota / create-account)

Surface C, never tenant-themed. Operator-only (separate role outside tenant grain).

```
/superadmin (overview)
   ├─ pending count badge → /superadmin/pending
   │
   ├─ ACTIVATE
   │    /superadmin/pending  (or /superadmin/tenants filtered=pending)
   │    → row → right drawer:
   │        - duration: valid_until (e.g. +30d / +1y / custom date)
   │        - quota: { contacts_max, messages_max, ai_tokens_max, seats_max }
   │        - vertical/modules override (optional)
   │      → "Activate"  → tenant.status='active'; write audit row; event TenantActivated
   │
   ├─ SUSPEND / REACTIVATE
   │    /superadmin/tenants → row drawer → toggle status
   │        - 'suspended' → tenant users hit /pending on next request
   │        - reason captured → audit log
   │
   ├─ ADJUST QUOTA / EXTEND
   │    /superadmin/tenants → row drawer → edit quota + valid_until → save → audit
   │
   ├─ CREATE ACCOUNT (pre-provision)
   │    /superadmin/users → "Tambah" → drawer:
   │        - create operator (platform role), OR
   │        - create a tenant + owner directly (status='active', skip public register)
   │      → owner gets credentials / invite
   │
   └─ VERTICALS
        /superadmin/verticals → CRUD bundles (vertical → [modules] + default entitlements)
        → these feed onboarding step 1 and the entitlement cap.

All actions: soft-delete + restore via /superadmin/trash; every state change → /superadmin/audit.
```

---

## 7. FLOW (c) — CRM navigation (Module 3)

CRM is one sidebar entry (`/app/crm`) that opens a **hub with a secondary sub-nav**. Entities are linked by app-level ids (no DB FK): `contact.company_id`, `deal.company_id`, `deal.contact_id`, `activity.subject_type/subject_id`.

```
/app/crm                → redirect to /app/crm/companies (or last-visited tab)
│
├── Sub-nav (tabs inside CRM hub):
│   [ Companies | Contacts | Deals | Pipeline | Activities ]
│
├── /app/crm/companies   CRUD-one-page
│     row → right drawer: company fields + nested lists
│            (contacts at this company, deals, recent activities — read links)
│
├── /app/crm/contacts    CRUD-one-page
│     drawer: contact fields, company picker (sets company_id),
│             "log activity" + "create deal" quick actions
│
├── /app/crm/deals       CRUD-one-page (table)
│     drawer: deal fields, stage, value, company/contact pickers
│
├── /app/crm/pipeline    SAME deals, KANBAN view
│     columns = stages (e.g. New → Qualified → Proposal → Won/Lost)
│     drag card between columns → updates deal.stage (optimistic + API)
│     card click → same deal right drawer as /deals
│
└── /app/crm/activities  timeline/log (calls, notes, messages)
      filter by company/contact/deal; "Tambah" → drawer log form
```

**Cross-entity navigation rules**
- From a Contact drawer → click company → navigates to that company's drawer/page.
- From a Company → see its contacts & deals inline (resolved app-side by `company_id`).
- Deleting a company (soft) does **not** cascade in DB; the **service** soft-deletes/handles orphans (per Rule 2/3 — cascade in app layer, with a warning in the confirm dialog).

---

## 8. FLOW (d) — How vertical / usage gates which modules appear

Two-level gating: **entitlement cap (superadmin)** ∩ **vertical bundle (onboarding)** = `enabled_modules`. The sidebar, routes, and middleware all read the same resolved set.

```
DEFINITIONS (data)
  vertical_bundle:  vertical → default [module flags]   (managed at /superadmin/verticals)
      HR     → { crm, inbox }                 (+ future HR-specific)
      Sales  → { workspace, products, crm, inbox, enrichment }
      Other  → { crm }                         (minimal; expand later)

  entitlements (per tenant, set at activation):
      allowed_modules: superset cap of what this tenant's plan permits
      quota: { contacts_max, messages_max, ai_tokens_max, seats_max }

RESOLUTION
  enabled_modules(tenant) = vertical_bundle(tenant.vertical) ∩ entitlements.allowed_modules
  (a module shows only if BOTH the vertical wants it AND the plan allows it)

ENFORCEMENT POINTS
  1) Sidebar render — each item has a `gate` (§3.1); hidden if module not in enabled_modules
                      or role insufficient.
  2) Route middleware — request to /app/<gatedRoute> while module disabled → 404/redirect /app.
  3) Action level — quota checks (e.g. add contact when contacts_max reached) → block + hint.

CHANGING IT LATER
  - Tenant can re-pick vertical / toggle modules at /app/settings/modules,
    but ONLY within entitlements.allowed_modules (can't exceed the plan).
  - Superadmin can widen/narrow entitlements at /superadmin/tenants → re-resolves enabled_modules.
```

**White-label vs. wayfinding (decision recorded here):**
- Tenant theme (`primary_color`) drives: sidebar background, active-item highlight, primary buttons, links, focus rings.
- **Per-menu icon colors stay fixed** (§3.1) to honor "1 solid color per menu" as a wayfinding system independent of brand. If a tenant's primary color clashes badly with the dark sidebar, the active highlight uses a tonal variant (lighten/darken) computed from `primary_color` — not a separate stored value.

---

## 9. Open questions for the user (to firm before wireframes)

1. **Superadmin identity:** platform operators as a role *outside* any tenant (recommended), vs. a special tenant flag? (Doc assumes outside-tenant.)
2. **Multi-workspace per tenant vs. strictly one:** memory says "1 workspace = 1 product" — confirm a tenant may own *several* workspaces (several products), each 1:1 with a product. (Doc assumes many workspaces, each 1 product.)
3. **HR vertical module set:** what does HR actually enable beyond CRM/Inbox? Placeholder bundle used above.
4. **Quota dimensions:** confirm the quota fields (`contacts_max, messages_max, ai_tokens_max, seats_max`) — these shape the activation drawer.

---

## 10. Phase-02 checklist (this doc)

- [x] Sitemap (all modules)
- [x] Sidebar nav, 1-color icon per menu (tenant + superadmin)
- [x] Page inventory per module (M1 detailed; M2–M5 inventoried)
- [x] Flow (a) register→pending→activate→onboarding→dashboard
- [x] Flow (b) superadmin console
- [x] Flow (c) CRM navigation
- [x] Flow (d) vertical/usage module gating
- [ ] Next: low-fi HTML wireframes for **M1 pages** (§4) → user approve → high-fi mockups → approve → code.
