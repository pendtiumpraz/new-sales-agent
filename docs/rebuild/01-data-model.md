# 01 — Data Model + Module Breakdown (Rebuild)

> **Phase 01 Planning output.** Authoritative data model for the greenfield rebuild.
> Honors FIRM decisions: Next.js 14 modular monolith (`modules/<domain>/{schema,repo,service,api}`),
> PostgreSQL/Drizzle with **NO foreign keys**, **snake_case** columns, **soft-delete (`deleted_at`)**,
> multi-tenant (grain = tenant), white-label per-tenant theming, vertical/usage-based onboarding +
> entitlements, public register → pending → superadmin activation, CRM as a first-class module,
> AI multi-provider (default DeepSeek).
>
> Reuses domain knowledge from the existing prototype `lib/db/schema.ts` and `lib/entitlements.ts`,
> rebuilt clean (mock layer dropped) and reorganized into modules.

---

## 0. Conventions (apply to EVERY table)

These are not repeated per-table below — assume them everywhere:

| Convention | Rule |
|------------|------|
| **Primary key** | `id text primary key` — app-generated string id (prefix per entity, e.g. `cmp_`, `deal_`). |
| **No foreign keys** | NO `.references()`. Relations are **soft refs** — a plain `*_id text` column. Referential integrity + cascade enforced in the **service layer**, never the DB. |
| **snake_case** | All table + column names `snake_case` (Drizzle property is camelCase, DB column is the snake string). |
| **Tenant grain** | Every tenant-scoped table carries `tenant_id text not null`. Only **global** tables (below) omit it. |
| **Soft delete** | Every business entity has `deleted_at timestamptz` (nullable). Trash + restore are app-level. Pure **event/log** tables (append-only, immutable) and **junction/registry** rows may omit `deleted_at` — flagged per table. |
| **Timestamps** | `created_at timestamptz default now() not null`. Mutable entities also `updated_at timestamptz default now() not null`. |
| **Indexes** | Tenant-scoped tables get a `*_tenant_idx` on `tenant_id`. Hot lookups get composite indexes (noted). |
| **JSON** | Variable-shape / list fields use `jsonb` with a typed `$type<...>()`. |

**Global (NOT tenant-scoped, no RLS) tables:** `users`, `tenants`, `ai_provider`, `ai_model`, `plan`, `platform_setting`, `pool_optout`. Everything else is tenant-scoped.

**Module communication:** modules talk via service calls + events, never by reaching into another module's tables directly (Modular-Monolith rule). A module owns its tables; cross-module reads go through the owning module's repo/service.

---

## 1. Module list (modular monolith)

`modules/<domain>/{schema.ts, repo.ts, service.ts, api.ts}`. Ordered by build sequence (M1 first per FIRM scope).

| # | Module | Domain key | Owns (entities) | Scope tier |
|---|--------|-----------|-----------------|------------|
| **M1** | **identity** | `identity` | `users`, `tenants`, `memberships`, `invites`, `auth_session`, `password_reset` | global + tenant |
| **M2** | **onboarding** | `onboarding` | `vertical`, `onboarding_state`, `tenant_entitlement`, `module_catalog` | tenant (+ global catalog) |
| **M3** | **branding** | `branding` | `tenant_theme` | tenant |
| **M4** | **workspace** | `workspace` | `workspace`, `product` | tenant |
| **M5** | **crm** | `crm` | `company`, `contact`, `deal`, `pipeline`, `pipeline_stage`, `activity`, `note` | tenant |
| **M6** | **inbox** | `inbox` | `conversation`, `message`, `channel_account` | tenant |
| **M7** | **enrichment** | `enrichment` | `enrichment_job`, `enrichment_source`, `contact_point`, `consent_record` | tenant |
| **M8** | **billing** | `billing` | `plan`, `subscription`, `credit_ledger`, `usage_counter` | global catalog + tenant |
| **M9** | **ai** | `ai` | `ai_provider`, `ai_model`, `ai_credential`, `tenant_active_model`, `ai_usage` | global catalog + tenant |
| **M10** | **platform** | `platform` | `platform_setting`, `audit_log`, `pool_optout` | global + tenant audit |

**Cross-cutting (used by all modules, owned by `platform`/`identity`):** `audit_log`, `tenant_id` propagation, soft-delete helpers.

The runtime sidebar/feature gate (existing `lib/entitlements.ts` MODULES list — `/contacts`, `/inbox`, `/cadences`, …) maps onto these modules via `module_catalog` (M2): the catalog row's `module_key` is both the entitlement toggle and the sidebar href.

---

## 2. M1 — identity (auth / tenant / users / memberships)

`users` is **GLOBAL** (one human → many tenants). Role lives on `memberships` (per-tenant), not on `users`.

### `users` *(global — no tenant_id, no deleted_at hard-delete is allowed for GDPR erasure but default soft)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `usr_…` |
| `name` | text not null | |
| `email` | text not null **unique** | login id |
| `password_hash` | text not null | **bcrypt/argon2** (rebuild fixes the prototype's plain-text storage) |
| `avatar_color` | text | UI fallback avatar |
| `is_superadmin` | boolean not null default false | platform staff flag (separate from per-tenant role) |
| `email_verified_at` | timestamptz | null until verified |
| `last_login_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | soft-delete (account closure / erasure) |

### `tenants` *(global)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `tnt_…` |
| `name` | text not null | brand/company name |
| `slug` | text **unique** | URL-safe handle (subdomain / path) |
| `status` | text not null default `'pending'` | `pending` → `active` → `suspended` → `expired`. Public register lands at `pending`. |
| `vertical_key` | text | soft ref → `vertical.key` (set at onboarding) |
| `plan_key` | text | soft ref → `plan.key` (set by superadmin on activation) |
| `active_until` | timestamptz | superadmin sets duration on activation; null = no activation |
| `activated_by` | text | soft ref → `users.id` (superadmin) |
| `activated_at` | timestamptz | |
| `onboarding_completed_at` | timestamptz | gate to dashboard |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

### `memberships` *(tenant)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `mbr_…` |
| `tenant_id` | text not null | |
| `user_id` | text not null | soft ref → `users.id` |
| `role` | text not null | `tenant_owner` \| `tenant_admin` \| `sales_manager` \| `sales_rep` |
| `status` | text not null default `'active'` | `active` \| `invited` \| `disabled` |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

- Unique index `(tenant_id, user_id)`; indexes on `tenant_id`, `user_id`.
- **Superadmin is NOT a membership** — it's `users.is_superadmin` (platform-level, cross-tenant).

### `invites` *(tenant)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `inv_…` |
| `tenant_id` | text not null | |
| `email` | text not null | invitee |
| `role` | text not null | role to grant on accept |
| `token` | text not null **unique** | accept link |
| `status` | text not null default `'pending'` | `pending` \| `accepted` \| `revoked` \| `expired` |
| `invited_by` | text | soft ref → `users.id` |
| `expires_at` | timestamptz | |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz | |

### `auth_session` *(tenant-aware, event-ish)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | session/jwt id |
| `user_id` | text not null | soft ref → `users.id` |
| `active_tenant_id` | text | currently-selected tenant context |
| `ip` | text | |
| `user_agent` | text | |
| `expires_at` | timestamptz | |
| `revoked_at` | timestamptz | |
| `created_at` | timestamptz | (no `deleted_at` — use `revoked_at`) |

### `password_reset` *(append-only)*
`id`, `user_id`, `token unique`, `expires_at`, `used_at`, `created_at`. No `deleted_at` (one-shot token).

---

## 3. M2 — onboarding / entitlements / vertical

Drives the **usage/vertical-based onboarding**: tenant picks a vertical → that sets the enabled `module_catalog` rows → written as `tenant_entitlement`.

### `vertical` *(global catalog)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | |
| `key` | text not null **unique** | `hr` \| `sales` \| `other` (extensible) |
| `name` | text not null | display, e.g. "HR / Rekrutmen", "Sales B2B" |
| `description` | text | |
| `default_modules` | jsonb `string[]` | module_keys enabled by default for this vertical |
| `icon` | text | |
| `sort` | integer default 0 | |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

### `module_catalog` *(global catalog)* — replaces the hardcoded `MODULES` list
| column | type | notes |
|--------|------|-------|
| `id` | text PK | |
| `module_key` | text not null **unique** | = route/href + toggle key, e.g. `/contacts`, `/inbox` |
| `label` | text not null | sidebar label (i18n key or BI default) |
| `domain` | text | owning module domain (`crm`, `inbox`, …) |
| `is_core` | boolean not null default false | core (Dashboard/Settings) — always on, not toggleable |
| `sidebar_color` | text | 1-color solid icon hex (UI-UX rule 6) |
| `sort` | integer default 0 | |
| `deleted_at` | timestamptz | |

### `tenant_entitlement` *(tenant)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | |
| `tenant_id` | text not null | |
| `module_key` | text not null | soft ref → `module_catalog.module_key` |
| `enabled` | boolean not null default true | **absent row = enabled** (default on); superadmin/onboarding can disable |
| `quota_overrides` | jsonb `Record<string,number>` | optional per-module quota (else plan quota) |
| `created_at` / `updated_at` | timestamptz | |

- Unique index `(tenant_id, module_key)`. (Junction-ish; soft-delete via `enabled=false`, no `deleted_at` needed.)

### `onboarding_state` *(tenant — one row per tenant)*
| column | type | notes |
|--------|------|-------|
| `tenant_id` | text PK | one-to-one with tenant |
| `step` | text not null default `'vertical'` | `vertical` → `branding` → `product` → `invite_team` → `done` |
| `vertical_key` | text | chosen vertical |
| `selected_modules` | jsonb `string[]` | confirmed module set (seeds `tenant_entitlement`) |
| `data` | jsonb | scratch answers collected during wizard |
| `completed_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

## 4. M3 — branding (white-label per-tenant)

### `tenant_theme` *(tenant — one row per tenant)*
| column | type | notes |
|--------|------|-------|
| `tenant_id` | text PK | one-to-one with tenant |
| `brand_name` | text | overrides tenant name in UI chrome |
| `logo_url` | text | uploaded logo (sidebar/header) |
| `logo_dark_url` | text | optional dark-mode logo |
| `favicon_url` | text | |
| `primary_color` | text not null default `'#3B82F6'` | drives CSS var `--primary` across UI (sidebar/buttons/accents) |
| `primary_dark` | text | hover shade (auto-derived if null) |
| `accent_color` | text | secondary accent |
| `sidebar_bg` | text default `'#1E293B'` | |
| `login_bg_url` | text | white-label login screen |
| `custom_domain` | text | optional vanity domain |
| `theme_tokens` | jsonb `Record<string,string>` | extra CSS-var overrides (escape hatch) |
| `updated_at` | timestamptz | |

Applied client-side as CSS variables; a tenant-scoped middleware/loader injects the theme on first paint.

---

## 5. M4 — workspace / product

**1 workspace = 1 product** (core product rule). A rep owns many workspaces.

### `workspace` *(tenant)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `wsp_…` |
| `tenant_id` | text not null | |
| `owner_user_id` | text not null | soft ref → `users.id` (the rep) |
| `name` | text not null | |
| `type` | text not null default `'lead_gen'` | `lead_gen` \| `partner` \| `offering` \| `retention` \| `custom` |
| `product_id` | text | soft ref → `product.id` (the one product) |
| `target_segment` | text | e.g. "AI Engineer Jakarta" |
| `status` | text not null default `'active'` | `active` \| `archived` |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

Indexes: `tenant_idx (tenant_id)`, `owner_idx (tenant_id, owner_user_id)`.

### `product` *(tenant)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `prd_…` |
| `tenant_id` | text not null | |
| `name` | text not null | |
| `category` | text | |
| `value_props` | jsonb `string[]` | |
| `pricing_notes` | text | |
| `target_market` | text | `B2B` \| `B2C` \| `both` |
| `icp` | jsonb `Record<string,unknown>` | AI-derived ideal customer profile |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

---

## 6. M5 — crm (companies, contacts, deals, pipeline, stages, activities)

First-class CRM. Soft refs everywhere (no FK). A `deal` lives in one `pipeline` at one `pipeline_stage`.

### `company` *(tenant)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `cmp_…` |
| `tenant_id` | text not null | |
| `name` | text not null | |
| `domain` | text | dedup key (normalized) |
| `industry` | text | |
| `size` | text | |
| `hq_country` / `hq_city` | text | |
| `website` | text | |
| `summary` | text | |
| `tech_stack` | jsonb `string[]` | |
| `socials` | jsonb `Record<string,string>` | |
| `owner_user_id` | text | soft ref → `users.id` |
| `status` | text not null default `'active'` | |
| `source` | text | provenance (enrichment) |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

Indexes: `tenant_idx`, `domain_idx (tenant_id, domain)`.

### `contact` *(tenant)* — the person/lead
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `ctc_…` |
| `tenant_id` | text not null | |
| `company_id` | text | soft ref → `company.id` |
| `workspace_id` | text | soft ref → `workspace.id` (scopes lead to a sales focus) |
| `full_name` | text not null | |
| `title` | text | |
| `department` / `seniority` | text | |
| `email` | text | |
| `phone` | text | |
| `whatsapp` | text | |
| `city` / `location` | text | |
| `channel_preference` | text | |
| `socials` | jsonb `Record<string,string>` | |
| `tags` | jsonb `string[]` | |
| `lead_type` | text | `b2c_customer` \| `b2b_partner` \| `unknown` |
| `lead_score` | real | classifier confidence 0..1 |
| `lead_reason` | text | why this classification |
| `lifecycle_stage` | text default `'lead'` | `lead` \| `mql` \| `sql` \| `customer` \| `churned` |
| `owner_user_id` | text | soft ref → `users.id` (assigned rep, per-rep isolation) |
| `consent_status` | text default `'unknown'` | `unknown` \| `legitimate_interest` \| `opted_in` \| `opted_out` |
| `source` | text | |
| `last_activity_at` | timestamptz | |
| `avatar_color` | text | |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

Indexes: `tenant_idx`, `company_idx (tenant_id, company_id)`, `owner_idx (tenant_id, owner_user_id)`.

### `pipeline` *(tenant)* — a named board (one per workspace or product line)
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `ppl_…` |
| `tenant_id` | text not null | |
| `name` | text not null | |
| `workspace_id` | text | soft ref → `workspace.id` (optional scope) |
| `is_default` | boolean not null default false | |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

### `pipeline_stage` *(tenant)* — ordered columns of a pipeline
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `stg_…` |
| `tenant_id` | text not null | |
| `pipeline_id` | text not null | soft ref → `pipeline.id` |
| `name` | text not null | e.g. prospek/kualifikasi/penawaran/negosiasi/tutup |
| `sort` | integer not null default 0 | column order |
| `probability` | integer | 0..100 default win prob for forecasting |
| `is_won` | boolean not null default false | terminal won |
| `is_lost` | boolean not null default false | terminal lost |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

Index: `pipeline_idx (tenant_id, pipeline_id)`.

### `deal` *(tenant)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `deal_…` |
| `tenant_id` | text not null | |
| `name` | text not null | |
| `pipeline_id` | text | soft ref → `pipeline.id` |
| `stage_id` | text | soft ref → `pipeline_stage.id` |
| `contact_id` | text | soft ref → `contact.id` |
| `company_id` | text | soft ref → `company.id` |
| `workspace_id` | text | soft ref → `workspace.id` |
| `product_id` | text | soft ref → `product.id` |
| `value` | real not null default 0 | |
| `currency` | text not null default `'IDR'` | |
| `status` | text not null default `'open'` | `open` \| `won` \| `lost` |
| `expected_close` | text | ISO date string |
| `closed_at` | timestamptz | |
| `lost_reason` | text | |
| `source_channel` | text | |
| `owner_user_id` | text | soft ref → `users.id` |
| `avatar_color` | text | |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

Indexes: `tenant_idx`, `stage_idx (tenant_id, stage_id)`, `contact_idx (tenant_id, contact_id)`.

### `activity` *(tenant)* — timeline events on a contact/deal/company
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `act_…` |
| `tenant_id` | text not null | |
| `subject_type` | text not null | `contact` \| `company` \| `deal` (polymorphic owner) |
| `subject_id` | text not null | soft ref to the subject |
| `type` | text not null | `call` \| `email` \| `meeting` \| `whatsapp` \| `task` \| `note` \| `stage_change` |
| `title` | text | |
| `body` | text | |
| `due_at` | timestamptz | for tasks |
| `done_at` | timestamptz | |
| `actor_user_id` | text | soft ref → `users.id` |
| `meta` | jsonb | structured payload (e.g. old/new stage) |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

Indexes: `tenant_idx`, `subject_idx (tenant_id, subject_type, subject_id)`.

### `note` *(tenant)* — free-text notes (kept separate from activity for quick capture)
`id`, `tenant_id`, `subject_type`, `subject_id`, `body`, `author_user_id`, `created_at`/`updated_at`, `deleted_at`.

---

## 7. M6 — inbox / conversations / messages

Multi-channel (WhatsApp-first) unified inbox.

### `channel_account` *(tenant)* — a connected sending/receiving identity
| column | type | notes |
|--------|------|-------|
| `id` | text PK | |
| `tenant_id` | text not null | |
| `user_id` | text | soft ref → `users.id` (per-rep, attribution) |
| `channel` | text not null | `whatsapp` \| `email` \| `instagram` \| `linkedin` |
| `identifier` | text | wa number / from-email / handle |
| `status` | text not null default `'disconnected'` | `idle` \| `pending` \| `qr` \| `connected` \| `disconnected` |
| `config_enc` | text | encrypted creds (SMTP / session) |
| `meta` | jsonb | QR string, daily limits, etc. |
| `last_seen_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

### `conversation` *(tenant)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `cnv_…` |
| `tenant_id` | text not null | |
| `contact_id` | text not null | soft ref → `contact.id` |
| `workspace_id` | text | soft ref → `workspace.id` |
| `channel` | text not null | `whatsapp` \| `email` \| … |
| `channel_account_id` | text | soft ref → `channel_account.id` |
| `assigned_user_id` | text | soft ref → `users.id` |
| `last_message` | text | preview |
| `last_message_at` | timestamptz | sort key |
| `unread_count` | integer not null default 0 | |
| `status` | text not null default `'open'` | `open` \| `snoozed` \| `closed` |
| `avatar_color` | text | |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

Indexes: `tenant_idx`, `contact_idx (tenant_id, contact_id)`, `last_msg_idx (tenant_id, last_message_at)`.

### `message` *(tenant — append-only)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | `msg_…` |
| `tenant_id` | text not null | denormalized for scoping |
| `conversation_id` | text not null | soft ref → `conversation.id` |
| `direction` | text not null | `in` \| `out` |
| `body` | text not null | |
| `subject` | text | email only |
| `channel` | text | |
| `status` | text | `queued` \| `sent` \| `delivered` \| `read` \| `failed` |
| `is_ai_generated` | boolean not null default false | AI auto-reply provenance |
| `attachment_label` | text | |
| `meta` | jsonb | provider ids, delivery receipts |
| `sent_at` | timestamptz | |
| `created_at` | timestamptz | (append-only — no `updated_at`/`deleted_at`; redact via tombstone if ever needed) |

Index: `conversation_idx (tenant_id, conversation_id, created_at)`.

---

## 8. M7 — enrichment

Improves lead data quality + profiling. RPA/extension/MCP fill jobs; AI summarizes. Provenance + consent are first-class (UU PDP).

### `enrichment_job` *(tenant)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | |
| `tenant_id` | text not null | |
| `subject_type` | text not null | `contact` \| `company` |
| `subject_id` | text | soft ref to subject (null for discovery jobs) |
| `kind` | text not null | `url` \| `domain` \| `linkedin` \| `industry` \| `bulk` \| `email_verify` |
| `input` | jsonb | url / query / batch |
| `status` | text not null default `'pending'` | `pending` \| `running` \| `done` \| `error` |
| `posture` | text not null default `'compliant'` | `compliant` \| `balanced` \| `aggressive` |
| `origin` | text | `mcp` \| `extension` \| `manual` |
| `result` | jsonb | merged fields written back to subject |
| `error` | text | |
| `created_at` / `finished_at` | timestamptz | |
| `deleted_at` | timestamptz | |

Index: `tenant_idx`.

### `enrichment_source` *(tenant — provenance log, append-only)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | |
| `tenant_id` | text not null | |
| `subject_type` / `subject_id` | text | what was enriched |
| `field` | text | which field this datum filled |
| `value` | text | raw value captured |
| `source` | text | where from |
| `source_url` | text | |
| `confidence` | real | 0..1 |
| `captured_mode` | text | `compliant` \| `balanced` \| `aggressive` |
| `captured_at` | timestamptz | |
| `created_at` | timestamptz | (append-only — no `deleted_at`) |

### `contact_point` *(tenant)* — polymorphic channel for company OR contact, with consent
| column | type | notes |
|--------|------|-------|
| `id` | text PK | |
| `tenant_id` | text not null | |
| `owner_type` | text not null | `company` \| `contact` |
| `owner_id` | text not null | soft ref |
| `channel` | text not null | `email` \| `phone` \| `whatsapp` \| `linkedin` \| `instagram` \| `web` \| `other` |
| `value` | text not null | |
| `label` | text | |
| `is_primary` | boolean not null default false | |
| `verified_at` | timestamptz | |
| `consent_status` | text not null default `'unknown'` | `unknown` \| `legitimate_interest` \| `opted_in` \| `opted_out` |
| `source` / `source_url` | text | |
| `captured_mode` | text | |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

Unique index `(tenant_id, owner_type, owner_id, channel, value)` (dedup); `owner_idx (owner_type, owner_id)`.

### `consent_record` *(tenant — append-only audit)*
`id`, `tenant_id`, `subject_type`, `subject_id`, `channel`, `status` (`consented`\|`pending`\|`none`\|`withdrawn`), `source` (`event`\|`form`\|`wa_optin`), `ip`, `policy_version`, `at`. Immutable trail (no `deleted_at`).

---

## 9. M8 — billing / credit

`plan` is a **global** catalog. `subscription` + ledger are tenant-scoped. Activation duration/quota set by superadmin (M1) writes here.

### `plan` *(global catalog)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | |
| `key` | text not null **unique** | `starter` \| `growth` \| `enterprise` |
| `name` | text not null | |
| `price_month_idr` | integer not null default 0 | |
| `quotas` | jsonb `Record<string,number>` | `ai_tokens`, `emails`, `seats`, `contacts`, … |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

### `subscription` *(tenant — one per tenant)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | |
| `tenant_id` | text not null | |
| `plan_key` | text not null | soft ref → `plan.key` |
| `status` | text not null default `'active'` | `active` \| `past_due` \| `canceled` \| `expired` |
| `seats` | integer not null default 5 | |
| `current_period_end` | timestamptz | mirrors `tenants.active_until` |
| `stripe_customer_id` | text | optional gateway linkage |
| `stripe_subscription_id` | text | |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

Unique index `(tenant_id)`.

### `credit_ledger` *(tenant — append-only, signed)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | |
| `tenant_id` | text not null | |
| `kind` | text not null | `grant` \| `revoke` \| `consume` \| `plan_allowance` |
| `unit` | text not null default `'ai_token'` | `ai_token` \| `email` \| `credit` |
| `amount` | integer not null | **signed** (+grant / −consume) |
| `reason` | text | |
| `ref_type` / `ref_id` | text | soft ref to the consuming event (e.g. `ai_usage.id`) |
| `actor_user_id` | text | superadmin for grants |
| `created_at` | timestamptz | (append-only — no `deleted_at`) |

Balance = `SUM(amount)` per `(tenant_id, unit)`. Replaces prototype's `credit_grant`.

### `usage_counter` *(tenant — rollup, one row per tenant×metric×period)*
`id`, `tenant_id`, `metric` (`ai_tokens`\|`emails`\|`contacts`\|`seats`), `period` (`'2026-06'` month bucket), `used` integer, `limit` integer, `updated_at`. Fast quota checks without scanning the ledger.

---

## 10. M9 — ai (multi-provider, default DeepSeek)

`ai_provider` + `ai_model` are a **global** catalog (superadmin-managed). Credentials/active-model/usage are tenant-scoped.

### `ai_provider` *(global catalog)*
`id`, `key` **unique** (`deepseek`\|`anthropic`\|`openai`\|`google`), `display_name`, `base_url`, `status`, `created_at`/`updated_at`, `deleted_at`.

### `ai_model` *(global catalog)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | |
| `provider_id` | text not null | soft ref → `ai_provider.id` |
| `model_id` | text not null | API string, e.g. `deepseek-chat`, `deepseek-reasoner` |
| `display_name` | text not null | |
| `context_window` | integer | |
| `price_in_per_1m` / `price_out_per_1m` | real | USD / 1M tokens |
| `capabilities` | jsonb `string[]` | `chat` \| `reasoning` \| `vision` |
| `is_available` | boolean not null default true | platform toggle |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | |

Unique index `(provider_id, model_id)`. **Default seed:** DeepSeek provider + `deepseek-chat`/`deepseek-reasoner`; Anthropic available via BYOK.

### `ai_credential` *(tenant — BYOK, encrypted)*
`id`, `tenant_id`, `provider_id` (soft ref), `api_key_enc` (AES-256-GCM), `label`, `source` (`tenant`\|`platform`), `created_at`/`updated_at`, `deleted_at`. Unique `(tenant_id, provider_id)`.

### `tenant_active_model` *(tenant — one row per tenant)*
`tenant_id` PK, `model_id` (soft ref → `ai_model.id`), `updated_at`. Default = DeepSeek model when unset.

### `ai_usage` *(tenant — append-only meter)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | |
| `tenant_id` | text not null | |
| `user_id` | text | soft ref → `users.id` |
| `model_id` | text | soft ref → `ai_model.id` |
| `feature` | text | `chat` \| `draft` \| `enrichment` \| `autoreply` \| … |
| `tokens_in` / `tokens_out` | integer not null default 0 | |
| `cost` | real not null default 0 | USD at call time |
| `latency_ms` | integer | |
| `at` | timestamptz default now() | (append-only — no `deleted_at`) |

Indexes: `tenant_idx`, `tenant_at_idx (tenant_id, at)`. Each row also writes a `credit_ledger consume` entry (M8).

---

## 11. M10 — platform (cross-cutting)

### `platform_setting` *(global)*
`key` PK, `value` text, `updated_at`. e.g. `wa_mode`, `deployment_mode`, `default_ai_model`.

### `audit_log` *(tenant-aware; tenant_id nullable for platform events)*
| column | type | notes |
|--------|------|-------|
| `id` | text PK | |
| `tenant_id` | text | nullable (platform-level events) |
| `actor_user_id` | text | soft ref → `users.id` |
| `action` | text not null | `tenant.activate`, `member.invite`, `theme.update`, … |
| `target_type` / `target_id` | text | what was acted on |
| `meta` | jsonb | |
| `at` | timestamptz default now() | (append-only — no `deleted_at`) |

Index: `tenant_idx`.

### `pool_optout` *(global do-not-contact registry)*
`value` PK (normalized email/phone), `channel`, `reason` (`opt_out`\|`dsar_erasure`), `at`. Honored by every tenant's enrichment/inbox. Append-only.

---

## 12. Relations map (app-level, NO FK)

```
users ──< memberships >── tenants ──1:1── tenant_theme
                                  ├──1:1── onboarding_state ── vertical (key)
                                  ├──< tenant_entitlement >── module_catalog (key)
                                  ├──1:1── subscription ── plan (key)
                                  └──< workspace (owner_user_id→users) ── product
tenants ──< company ──< contact >── company
                contact ──< deal >── pipeline ──< pipeline_stage
                contact ──< conversation ──< message
                contact ──< contact_point ──< consent_record
                contact ──< activity / note   (polymorphic subject_*)
                contact ──< enrichment_job ──< enrichment_source
tenants ──< ai_credential ── ai_provider ──< ai_model ──1:1 tenant_active_model
                                                  └──< ai_usage ──> credit_ledger
all tables ──> audit_log (actor_user_id, tenant_id)
```

Every `*_id` above is a **plain text soft ref** — joins + cascade are service-layer.

---

## 13. Deltas from the existing prototype (what the rebuild changes)

| Prototype | Rebuild | Why |
|-----------|---------|-----|
| `users.password` plain-text | `users.password_hash` (bcrypt/argon2) | security; prototype's "demo" excuse dropped |
| `MODULES` hardcoded in `lib/entitlements.ts` | `module_catalog` table + `vertical.default_modules` | data-driven vertical onboarding |
| no `tenant_theme` | `tenant_theme` table | white-label (FIRM) |
| no `vertical` / `onboarding_state` | added | usage-based onboarding (FIRM) |
| `contacts` + `person` (two overlapping tables) | unified into `contact` | one CRM person entity |
| `deals.stage` free-text string | `deal.stage_id` → `pipeline_stage` rows | configurable pipelines (CRM first-class) |
| no `pipeline` / `pipeline_stage` | added | configurable boards |
| `credit_grant` only | `credit_ledger` (signed, all kinds) + `usage_counter` | unified credit accounting |
| `messages` no `is_ai_generated` | added | AI auto-reply provenance |
| `tenants.plan` text | `tenants.plan_key` + `subscription` | superadmin activation w/ duration+quota |
| scattered `consent`/`consent_log`/`suppression` | `consent_record` + `pool_optout` + `contact_point.consent_status` | coherent consent model |

Subsystems deferred (port later, not in M1–M7 core): cadences, autopilot, quotes/penawaran, marketplace, WA gateway outbox, compliance register (DPIA/vendor_risk). They keep their prototype shapes when reintroduced as their own modules.
