# 03 — White-Label Theming + Tenant Entitlements (Rebuild)

> **Phase 03 Planning output.** Specifies (A) per-tenant white-label theming and (B)
> usage/vertical-based entitlements + quotas + enforcement. Honors FIRM decisions:
> Next.js 14 modular monolith (`modules/<domain>/{schema,repo,service,api}`),
> PostgreSQL/Drizzle **NO foreign keys**, **snake_case**, **soft-delete (`deleted_at`)**,
> multi-tenant (grain = tenant), white-label per-tenant theming, vertical/usage-based
> onboarding + entitlements, public register → pending → superadmin activation,
> CRM first-class, AI multi-provider (default DeepSeek).
>
> **Extends, does not reinvent**, `lib/entitlements.ts` (the `MODULES` list + `tenant_entitlement`
> table + `disabledForTenant`/`setEntitlement`/`entitlementMatrix` helpers) and the data model in
> `docs/rebuild/01-data-model.md` (M2 onboarding, M3 branding) + flows in `docs/rebuild/02-ia-flows.md`
> (§5 register→activate→onboarding, §8 vertical/usage gating).
>
> Owning modules: **M2 `onboarding`** (vertical, entitlement, quota) and **M3 `branding`** (theme).
> No application code in this doc — planning + contracts only.

---

## Part A — White-Label Theming (per-tenant)

### A.1 What a tenant can customize

Three things the user named (`user_requirement.md` §🆕.1): **primary color, logo, brand name** — applied across the whole UI (sidebar, buttons, accents). Plus a small set of derived/secondary knobs so the result looks coherent rather than one garish accent on a fixed palette.

| Knob | Required | Default | Drives |
|------|----------|---------|--------|
| `brand_name` | no | tenant `name` | sidebar wordmark, topbar title, page `<title>`, emails |
| `logo_url` | no | initials avatar from `brand_name` | sidebar header, login screen |
| `logo_dark_url` | no | `logo_url` | logo variant on dark sidebar |
| `favicon_url` | no | platform favicon | browser tab |
| `primary_color` | **yes** | `#FD7A5C` (current coral) / `#3B82F6` (Sainskerta blue) | primary buttons, links, active nav, focus rings, sidebar active highlight |
| `primary_dark` | no | auto-derived (−12% L) | primary hover |
| `accent_color` | no | derived | secondary accents, badges |
| `sidebar_bg` | no | `#1E293B` | sidebar background |
| `login_bg_url` | no | none | white-label login background |
| `custom_domain` | no | none | vanity domain (future) |
| `theme_tokens` | no | `{}` | escape hatch: extra raw CSS-var overrides |

> **Scope boundary (firm, from `02-ia-flows.md` §3 + §8):** the **per-menu sidebar icon colors stay fixed** (wayfinding, Sainskerta Rule 6 "1 solid color per menu"). White-label themes the **chrome** (sidebar bg, active highlight, buttons, links, focus rings) — **not** the per-menu icon hues. The **Superadmin Console (Surface C) is never themed by any tenant** — it always renders the neutral Sainskerta identity so operators always know they're in the platform console.

### A.2 Where it's stored — `tenant_theme` (tenant-scoped, no FK)

One row per tenant. Already specified in `01-data-model.md` §4 (M3 branding). Restated here as the authoritative contract for this phase. Conventions from `01-data-model.md` §0 apply (snake_case columns, soft-ref `tenant_id`, no FK).

```
table tenant_theme  (module: branding)   — tenant-scoped, 1:1 with tenant
  tenant_id      text PRIMARY KEY          -- soft ref → tenants.id (the row's PK = the tenant)
  brand_name     text                      -- overrides tenant.name in UI chrome
  logo_url       text
  logo_dark_url  text
  favicon_url    text
  primary_color  text NOT NULL DEFAULT '#FD7A5C'   -- hex; source of truth
  primary_dark   text                      -- hover; auto-derived if null
  accent_color   text
  sidebar_bg     text DEFAULT '#1E293B'
  login_bg_url   text
  custom_domain  text                      -- optional vanity domain
  theme_tokens   jsonb DEFAULT '{}'        -- Record<string,string> extra CSS-var overrides
  updated_at     timestamptz DEFAULT now() NOT NULL
```

Notes:
- **`tenant_id` is the PK** (1:1 with tenant) — no separate `id`, no FK. Resolving the theme = a single point-read by `tenant_id`.
- **No `deleted_at`**: the theme is a satellite of the tenant; it lives/dies with the tenant (cascade handled in the `identity` service when a tenant is soft-deleted — Rule 2/3, app-layer cascade). Reverting to default = clear the columns, not delete the row.
- **Colors stored as hex strings** (`#RRGGBB`) — designer-friendly, what the color picker emits. Conversion to the runtime HSL-channel format (below) happens at apply-time, not at rest.
- **Logos**: `*_url` point at uploaded assets (Vercel Blob / S3-compatible). The branding service owns upload + validation (size ≤ 512KB, type ∈ png/svg/webp, dimensions sane). Only the URL is stored.

### A.3 How it's applied — CSS custom properties on the app shell + Tailwind

The project **already** uses a shadcn-style token system in `app/globals.css`: tokens are **space-separated HSL channels** (e.g. `--primary: 12 96% 67%;`) and Tailwind consumes them as `hsl(var(--primary))`. White-label **overrides these same variables per tenant** — it does **not** introduce a parallel theming system. This is the single most important technical decision in Part A: *we reuse the existing token contract, we don't bolt on a second one.*

**Token mapping** (tenant column → existing CSS var):

| `tenant_theme` column | CSS var overridden | Notes |
|------------------------|--------------------|-------|
| `primary_color` | `--primary`, `--ring` | hex → HSL channels at apply time |
| `primary_dark` | `--primary-hover` (new) | derived if null |
| `primary_color` (computed FG) | `--primary-foreground` | auto pick black/white for WCAG contrast |
| `accent_color` | `--tertiary` (or a new `--brand-accent`) | optional |
| `sidebar_bg` | `--sidebar-bg` (new) | sidebar shell only |
| `theme_tokens[k]` | `--{k}` | raw escape-hatch overrides |

**Apply mechanism — three layers, in order:**

1. **Server-rendered first paint (no flash).** The tenant app shell (`app/(app)/app/layout.tsx`, a **Server Component**) resolves the theme for the active tenant during SSR and injects a scoped `<style>` on the shell wrapper. We scope to a wrapper element (`#app-shell` / `[data-tenant-theme]`), **not** `:root`, so the tenant theme can't leak into the (auth) or (superadmin) route groups that share the same document:

   ```html
   <div id="app-shell" style="
       --primary: 12 96% 67%;
       --primary-hover: 12 80% 55%;
       --primary-foreground: 0 0% 100%;
       --ring: 12 96% 67%;
       --sidebar-bg: 217 33% 17%;
     ">
     {sidebar + topbar + page}
   </div>
   ```

   Because it's inline on the SSR'd wrapper, the correct brand color is present on the **very first byte** — no theme flash, no client round-trip.

2. **Tailwind reads the vars unchanged.** No Tailwind config change is needed beyond what already exists: `bg-primary`, `text-primary`, `ring-primary`, `border-primary` already compile to `hsl(var(--primary))`, and any descendant of `#app-shell` inherits the overridden value. Existing components are themed **for free** the moment they live inside the shell. We add at most two new tokens to `globals.css` `:root` defaults (`--primary-hover`, `--sidebar-bg`) so non-tenant surfaces have sane fallbacks.

3. **Client live-preview (onboarding + settings editor only).** The onboarding "Brand" step (`/onboarding/brand`) and `/app/settings/brand` need instant preview as the user drags the color picker. A tiny client helper writes the same vars onto the shell wrapper's `style` imperatively (`el.style.setProperty('--primary', hslChannels)`) on each change, and the **Save** action persists to `tenant_theme`. Same variables, same target element — preview and production are identical by construction.

**Hex → HSL-channel conversion + derived tokens** (pure function in `modules/branding/service.ts`, e.g. `resolveThemeVars(theme) → Record<string,string>`):
- `#FD7A5C` → `"12 96% 67%"` (the space-separated channels shadcn expects).
- `--primary-foreground`: compute relative luminance of `primary_color`; pick `0 0% 100%` (white) or `24 6% 10%` (near-black) for ≥ 4.5:1 contrast (WCAG AA on buttons).
- `--primary-hover` / `--primary-dark`: if `primary_dark` null, darken L by ~12%.
- `--sidebar-active`: a tonal variant of `primary_color` chosen to read on `sidebar_bg` (lighten/darken computed, **not** a separately stored value — per `02-ia-flows.md` §8 decision).

**Favicon + brand name + logo** are applied via Next.js metadata + the shell components (server-resolved), not CSS vars:
- `brand_name` → shell wordmark + `generateMetadata` title.
- `favicon_url` → dynamic `<link rel="icon">` in the (app) layout metadata.
- `logo_url`/`logo_dark_url` → `<Image>` in `Sidebar`/`Topbar`, falling back to a generated initials avatar.

### A.4 Resolution + caching

- **Resolver:** `branding.getTheme(tenantId)` → row or defaults. Single point-read by PK (`tenant_id`).
- **Cache:** memoize per request (React `cache()`), and cache across requests keyed by `tenantId` (in-memory LRU, or `unstable_cache` with tag `theme:{tenantId}`). **Invalidate on save** (`revalidateTag('theme:'+tenantId)`), so an edit in `/app/settings/brand` reflects on next navigation without a flash.
- **Defaults when no row:** the platform default theme (current coral `#FD7A5C`, or Sainskerta blue `#3B82F6` — pick one in `platform_setting.default_primary_color`). Auth + superadmin surfaces always use defaults.
- **Audit:** every theme write emits `audit_log` action `theme.update` (actor, tenant, before/after in `meta`) — consistent with `01-data-model.md` §11.

### A.5 Custom domain (forward-looking, not M1)

`custom_domain` lets a tenant serve the app on their own host. Resolution: middleware reads `Host` header → looks up `tenant_theme.custom_domain` → sets active tenant context. Out of M1 scope (Vercel multi-domain + SSL provisioning); the column exists now so the model is stable. Until then, tenant context comes from the authenticated session's `active_tenant_id`.

---

## Part B — Usage / Vertical-Based Entitlements

### B.1 Model overview (extends `lib/entitlements.ts`)

The existing `lib/entitlements.ts` already gives us: a `MODULES` list (toggle key = route href), a `tenant_entitlement` table (absent row = **enabled by default**), and `disabledForTenant` / `setEntitlement` / `entitlementMatrix` helpers. The rebuild **keeps that exact semantics and helper shape** and adds three things the prototype lacked:

1. **`module_catalog`** — the `MODULES` array becomes a **global catalog table** (so verticals + superadmin manage it as data, not code).
2. **`vertical`** — a global catalog mapping a usage type (HR / Sales / Other) → a **default module bundle**.
3. **Quotas** — numeric usage limits per tenant (plan-derived, superadmin-overridable), enforced at the **action** level (not just module on/off).

Resolution stays the two-level intersection from `02-ia-flows.md` §8:

```
enabled_modules(tenant) = vertical_bundle(tenant.vertical_key)  ∩  entitlement_cap(tenant)
```
- **vertical_bundle** = what the chosen usage *wants* (set at onboarding, re-pickable in settings).
- **entitlement_cap** = what the tenant's plan/activation *permits* (superadmin-set ceiling).
- A module renders **only if BOTH** allow it. A tenant can never enable a module its plan forbids.

### B.2 Verticals → modules

`vertical` is a global catalog (`01-data-model.md` §3). Each vertical names a **default module bundle** keyed by `module_catalog.module_key`. The bundles below are the **seed**; superadmin edits them at `/superadmin/verticals`.

| Vertical (`key`) | Display | Default modules (bundle) | Rationale |
|------------------|---------|--------------------------|-----------|
| `sales` | Sales B2B/B2C | `/workspaces`, `/products`, `/crm`, `/inbox`, `/enrichment` | full sales stack (the flagship use-case) |
| `hr` | HR / Rekrutmen | `/crm`, `/inbox` (+ future HR-specific) | candidates-as-contacts + outreach; `enrichment` off by default |
| `other` | Lainnya | `/crm` | minimal; expand per tenant |

> **Core modules are never in a bundle and never toggleable** (carried over from `lib/entitlements.ts` comment "Dashboard / Panduan / Pengaturan are core — always on"): `/app` (Dashboard), `/app/settings`, `/app/trash`, `/app/team`. `module_catalog.is_core = true` marks them; they render for every active tenant regardless of vertical/entitlement (still **role-gated**, e.g. Team/Trash for owner/admin only — `02-ia-flows.md` §3.1).

**`module_catalog` seed** maps the existing `MODULES` keys onto the rebuild's module domains and the sidebar colors from `02-ia-flows.md` §3.1:

| `module_key` | `label` | `domain` | `is_core` | `sidebar_color` |
|--------------|---------|----------|-----------|-----------------|
| `/app` | Dashboard | platform | true | `#3B82F6` |
| `/workspaces` | Workspace | workspace | false | `#10B981` |
| `/products` | Produk | workspace | false | `#F59E0B` |
| `/crm` | CRM | crm | false | `#14B8A6` |
| `/inbox` | Inbox | inbox | false | `#6366F1` |
| `/enrichment` | Enrichment | enrichment | false | `#8B5CF6` |
| `/team` | Team | identity | true (role-gated) | `#EF4444` |
| `/settings` | Pengaturan | platform | true | `#6B7280` |
| `/trash` | Trash | platform | true (role-gated) | `#F97316` |

> Legacy prototype keys (`/cadences`, `/escalations`, `/content`, `/retention`, `/ecommerce`, `/field`, `/penawaran`, `/reports`, `/autopilot`, `/marketplace`, `/pipeline`) are **deferred** subsystems (`01-data-model.md` §13). They re-enter `module_catalog` as their own modules when reintroduced; the catalog being data-driven means no code change to add them — just a row + a vertical-bundle edit.

### B.3 Default quotas

Quotas are numeric usage ceilings, **plan-derived** with **per-tenant override** set by superadmin at activation (`02-ia-flows.md` §5–6 — "set duration + quota"). They live in the billing module (`plan.quotas` global default; `usage_counter`/`tenant_entitlement.quota_overrides` per tenant) — `01-data-model.md` §9.

**Quota dimensions** (firm the names here; they shape the activation drawer):

| Metric key | Unit | Meaning |
|------------|------|---------|
| `seats_max` | count | active memberships allowed |
| `contacts_max` | count | CRM contacts (lifetime, soft-deleted excluded) |
| `companies_max` | count | CRM companies |
| `messages_max` | count / month | outbound messages (inbox) per period |
| `ai_tokens_max` | tokens / month | AI usage ceiling (mirrors `credit_ledger`) |
| `enrichment_max` | count / month | enrichment jobs per period |

**Default quotas by plan** (`plan.quotas` seed; superadmin can override per tenant):

| Plan (`key`) | seats | contacts | companies | messages/mo | ai_tokens/mo | enrichment/mo |
|--------------|-------|----------|-----------|-------------|--------------|---------------|
| `starter` | 3 | 1 000 | 300 | 2 000 | 200 000 | 100 |
| `growth` | 10 | 10 000 | 3 000 | 20 000 | 2 000 000 | 1 000 |
| `enterprise` | 50 | 100 000 | 30 000 | 200 000 | 20 000 000 | 10 000 |

- **Resolution order for a quota:** `tenant_entitlement.quota_overrides[metric]` (per-tenant, superadmin) → else `plan.quotas[metric]` (plan default) → else **unlimited** (null) only for enterprise dimensions explicitly set null.
- **Period metrics** (`*/mo`) reset per calendar month via the `usage_counter` rollup (`period = '2026-06'` bucket, `01-data-model.md` §9). **Lifetime metrics** (`seats_max`, `contacts_max`, `companies_max`) count current non-deleted rows.
- A **pending** tenant has effectively **zero** quota (it can't reach `/app` until activated); activation is what writes the real numbers.

### B.4 Resolution function (the single source of truth)

One service computes the resolved entitlement state, consumed by every enforcement point. Extends the existing helpers rather than replacing them:

```
modules/onboarding/service.ts

  resolveEntitlements(tenantId): {
    enabledModules: string[]      // = bundle(vertical) ∩ cap(tenant), minus disabled rows; + core always
    quotas: Record<metric, number|null>  // resolved per B.3
    vertical: string
  }

  // building blocks (reuse + extend lib/entitlements.ts):
  bundleForVertical(verticalKey): string[]            // from vertical.default_modules
  entitlementCap(tenantId): string[]                  // plan-allowed module keys
  disabledForTenant(tenantId): string[]               // EXISTING helper — kept verbatim
  setEntitlement(tenantId, moduleKey, enabled)        // EXISTING helper — kept verbatim
  resolveQuota(tenantId, metric): number | null       // override → plan → null
```

`enabledModules = core ∪ ( (bundle ∩ cap) \ disabledForTenant )`. The sidebar, middleware, and settings page **all call `resolveEntitlements`** — one definition, three consumers, no drift.

### B.5 Enforcement points (three layers — defense in depth)

Gating is enforced at **three** independent layers so a bypass at one (e.g. a deep link skipping the sidebar) is caught by the next. This matches `02-ia-flows.md` §8 "ENFORCEMENT POINTS".

**1. Middleware / route guard (coarse — module on/off + tenant status).**
`middleware.ts` (Edge) runs on every `/app/**` request and is the first gate:
- **Tenant status gate** (precedes module gate): resolve active tenant → if `status ∈ {pending, suspended}` or `active_until` expired → redirect `/pending` (with reason). If `onboarding_completed_at` null → redirect `/onboarding`. (`02-ia-flows.md` §5 guards.)
- **Module gate:** map request path → owning `module_key`; if that key ∉ `enabledModules(tenant)` → redirect `/app` (or 404). Core routes (`is_core`) always pass the module gate (still role-checked in the page).
- **Surface gate:** `/superadmin/**` requires `users.is_superadmin`; never themed, never entitlement-gated by tenant.
- *Edge note:* middleware can't hit Postgres directly on Edge cheaply, so it reads a **signed session claim** carrying `{tenantId, status, onboarded, enabledModules-hash}` minted at login/activation and refreshed on entitlement change. The authoritative check still happens server-side (layer 2); the claim is a fast-path, not the source of truth.

**2. Server layout / API guard (authoritative — re-resolves on the server).**
The `(app)` layout (Server Component) and **every** module API route call `requireModule(moduleKey)` / `requireRole(role)` against a fresh `resolveEntitlements(tenantId)`:
- Layout: hides nav + 403s the page body if the module is off (covers a stale/forged session claim).
- API: each `modules/<domain>/api.ts` handler begins with `assertEntitled(tenantId, moduleKey)` before any read/write — so even a direct `fetch` to a disabled module's endpoint is rejected (`403 module_disabled`). This is the **real** ceiling; the middleware is just UX speed.

**3. Action-level quota guard (fine — usage limits).**
Quotas can't be route-gated (you're *inside* an enabled module); they're checked at the mutating action:
- Before a create/invite/send/enrich, the service calls `assertQuota(tenantId, metric, +1)`:
  - read `usage_counter` (period metrics) or `COUNT(*)` of non-deleted rows (lifetime metrics),
  - compare to `resolveQuota(tenantId, metric)`,
  - if over → throw `QuotaExceeded(metric)` → API returns `429 quota_exceeded` with `{metric, used, limit}`.
- The UI surfaces this as a **non-blocking action error + upgrade hint** (not a route block), and `/app/settings/billing` shows the usage bars (`02-ia-flows.md` §5: "Quota exceeded → action-level block").
- Soft-delete frees lifetime quota (deleting a contact lets you add another); period metrics only reset on the month rollover.

**Enforcement summary table:**

| Layer | Where | Checks | Failure |
|-------|-------|--------|---------|
| Middleware | `middleware.ts` (Edge) | tenant status, onboarding, module-on, surface | redirect `/pending` `/onboarding` `/app` |
| Server guard | `(app)` layout + `modules/*/api.ts` | re-resolve module + role (authoritative) | 403 page / `403 module_disabled` |
| Action guard | service mutating methods | quota per metric | `429 quota_exceeded` + UI hint |

### B.6 Where each piece is stored (recap — all tenant-scoped, no FK)

| Concern | Table | Module | Grain |
|---------|-------|--------|-------|
| Vertical catalog + bundles | `vertical` (`default_modules` jsonb) | onboarding | global catalog |
| Module catalog | `module_catalog` | onboarding | global catalog |
| Per-tenant module on/off | `tenant_entitlement` (`enabled`, `quota_overrides`) | onboarding | tenant |
| Tenant's chosen vertical + wizard state | `onboarding_state`, `tenants.vertical_key` | onboarding / identity | tenant |
| Plan default quotas | `plan.quotas` | billing | global catalog |
| Period usage rollup | `usage_counter` | billing | tenant |
| Activation (duration + quota set) | `tenants.active_until`, `subscription`, `tenant_entitlement.quota_overrides` | identity / billing | tenant |
| Theme | `tenant_theme` | branding | tenant |

### B.7 Change-over-time semantics

- **Onboarding sets** `tenants.vertical_key` + writes the bundle into `tenant_entitlement` (only enabling keys within the cap). `onboarding_state.selected_modules` records the confirmed set.
- **Tenant self-edit** at `/app/settings/modules`: toggle modules **within the cap only** (can't exceed plan) → `setEntitlement` per key → invalidate the entitlement cache + re-mint session claim.
- **Superadmin** at `/superadmin/tenants`: widen/narrow the **cap** (plan change or per-module override) + adjust quotas + extend `active_until`. Re-resolves `enabledModules`, re-mints claims for that tenant's sessions, writes `audit_log` (`tenant.entitlement.update`, `tenant.quota.update`).
- **Superadmin** at `/superadmin/verticals`: edit a vertical's `default_modules` → affects **future** onboardings (does not retroactively rewrite existing tenants' `tenant_entitlement`).
- Every entitlement/quota write emits an `audit_log` row (consistent with theming in A.4).

---

## C. Deltas from the existing prototype (`lib/entitlements.ts`)

| Prototype | Rebuild | Why |
|-----------|---------|-----|
| `MODULES` hardcoded array in `lib/entitlements.ts` | `module_catalog` table (seeded from it) | data-driven; verticals + superadmin manage as data |
| `tenant_entitlement` (id, tenant_id, module_key, enabled) | + `quota_overrides jsonb` | per-tenant quota override at the same grain |
| no vertical concept | `vertical` catalog + `default_modules` bundle | usage/vertical-based onboarding (FIRM) |
| on/off only | + numeric quotas + action-level enforcement | "usage terbatas sesuai onboarding" (FIRM) |
| `disabledForTenant` / `setEntitlement` / `entitlementMatrix` | **kept verbatim**; wrapped by `resolveEntitlements` | extend, don't reinvent |
| no theming | `tenant_theme` + CSS-var override of existing shadcn tokens | white-label per-tenant (FIRM) |
| single global palette (`globals.css :root`) | same tokens, **overridden per-tenant on `#app-shell`** | reuse token contract, no parallel system |

---

## D. Phase-03 checklist

- [x] Per-tenant theme model (primary color, logo, brand name + derived knobs) — A.1
- [x] Storage: `tenant_theme`, tenant-scoped PK, no FK, no `deleted_at` (cascade in service) — A.2
- [x] Technical application: CSS custom properties on app shell wrapper + existing Tailwind/shadcn tokens, SSR-injected (no flash) + client live-preview — A.3
- [x] Resolution + caching + audit + custom-domain forward-look — A.4–A.5
- [x] Verticals (HR / Sales / Other) → module bundles, extends `lib/entitlements.ts` — B.1–B.2
- [x] Default quotas (dimensions + per-plan table + resolution order) — B.3
- [x] Resolution function (single source of truth) — B.4
- [x] Enforcement points: middleware + server/API guard + action-level quota — B.5
- [x] Storage recap + change-over-time semantics — B.6–B.7
- [x] Deltas from prototype — C
- [ ] Next: M1 wireframes for `/onboarding/brand` (live theme preview) + `/onboarding/vertical` (bundle cards) + `/app/settings/modules` + superadmin activation drawer (duration + quota).
