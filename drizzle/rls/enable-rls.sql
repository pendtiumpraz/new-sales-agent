-- Row-Level Security — REBUILD tables (Sainskerta Loop, doc 19 + AUDIT #3/#25/#27/#29/#41).
--
-- This file targets the REAL rebuild module tables — every table that carries a
-- `tenant_id` column across modules/**/schema.ts. It supersedes the old
-- legacy-named version (which enumerated `deals`/`contacts`/`company`/… and would
-- no-op against this DB).
--
-- WHO CONNECTS — this is the load-bearing part:
--   • Migrations / drizzle-kit / studio connect as the table OWNER (neondb_owner),
--     which has BYPASSRLS — policies DO NOT apply to it. That is intentional.
--   • The APP connects at runtime as a dedicated NOBYPASSRLS role (`app_user`,
--     wired via APP_POSTGRES_URL in lib/db/client.ts). Policies apply to it.
--   • FORCE ROW LEVEL SECURITY additionally makes policies apply to the table
--     owner too (belt-and-suspenders) — so even an accidental owner-connection at
--     runtime is filtered. The superadmin escape hatch is the POLICY PREDICATE
--     (app.role = 'superadmin'), not a DB superuser — keeping it auditable (doc 26).
--
-- CONTEXT — set per request inside withTenant() (lib/db/tenant-context.ts), which
-- runs (transaction-local, parameterized → injection-safe):
--   select set_config('app.tenant_id', <tenant>, true);
--   select set_config('app.user_id',   <user>,   true);
--   select set_config('app.role',      <role>,   true);
--
-- FAIL-CLOSED: current_setting(..., true) returns NULL (not an error) when unset.
-- An unset app.tenant_id therefore matches no tenant row → no rows leak when a
-- query forgets to open withTenant().
--
-- HOW TO APPLY: do NOT run this through scripts/apply-rebuild-migration.mts — that
-- applier is an additive-only guard that ABORTS on ALTER TABLE (all this file is).
-- Apply it via the dedicated path documented in drizzle/rls/README.md:
--   psql "$APP_POSTGRES_URL_NON_POOLING" -f drizzle/rls/enable-rls.sql   (or as owner)
--
-- IDEMPOTENT: ENABLE/FORCE are no-ops if already set; the policy is dropped first
-- so re-running this file cleanly replaces it.

-- ── Tenant-scoped data tables (standard policy) ─────────────────────────────
-- Every rebuild table with a `tenant_id` column. USING (read) + WITH CHECK
-- (write) both pin to current_setting('app.tenant_id'); a 'superadmin' role
-- bypasses the tenant pin via the policy predicate.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- tenant (membership is OMITTED here on purpose — it gets its own
    -- user_id-aware policy in the dedicated block below)
    'usage_counter',
    -- crm
    'company_v2','contact','pipeline','pipeline_stage','deal','activity',
    -- inbox
    'conversation_v2','message_v2',
    -- notification (topbar bell feed; user_id NULL = tenant-wide)
    'notification',
    -- api_key (per-account BYOA keys; auth-time lookup uses a superadmin ctx)
    'api_key',
    -- outreach
    'cadence_v2','cadence_step_v2','cadence_enrollment_v2','autopilot_run_v2','escalation','handoff',
    -- onboarding / entitlements
    'tenant_entitlement_v2','onboarding_state',
    -- content
    'content_template','content_plan',
    -- ecommerce
    'marketplace_order','cart_recovery',
    -- enrichment / discovery
    'discovery_job','discovery_result','enrichment_record',
    -- field
    'field_visit','field_check_in',
    -- marketplace
    'marketplace_integration','marketplace_listing_v2',
    -- product
    'product_v2',
    -- reports
    'saved_report',
    -- retention
    'retention_flow','retention_step','retention_enrollment',
    -- sales / closing-flow
    'conversation_stage','closing_readiness','kb_technique',
    -- settings
    'knowledge_base','tenant_settings',
    -- wa transport
    'wa_session_v2','wa_outbox_v2',
    -- workspace
    'workspace_v2','market_fit','sales_play',
    -- ai meter/registry (AUDIT #27) — the tenant-scoped half of the AI catalog.
    -- ai_provider / ai_model are a GLOBAL catalog (no tenant_id, app-gated) and are
    -- intentionally NOT here; these three carry a tenant_id and need the pin.
    'ai_credential','tenant_active_model','ai_usage'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (
          tenant_id = current_setting('app.tenant_id', true)
          OR current_setting('app.role', true) = 'superadmin'
        )
        WITH CHECK (
          tenant_id = current_setting('app.tenant_id', true)
          OR current_setting('app.role', true) = 'superadmin'
        );
    $f$, t, t);
  END LOOP;
END $$;

-- ── membership (special: user must see their OWN rows pre-tenant) ────────────
-- Login resolves "which tenants am I in?" by user_id BEFORE a tenant is selected,
-- so the membership policy additionally allows user_id = app.user_id. WITH CHECK
-- keeps writes pinned to the active tenant (a user can't insert a membership into
-- another tenant) — the read path is the only one that needs the user_id escape.
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON membership;
CREATE POLICY tenant_isolation ON membership
  USING (
    tenant_id = current_setting('app.tenant_id', true)
    OR user_id = current_setting('app.user_id', true)
    OR current_setting('app.role', true) = 'superadmin'
  )
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)
    OR current_setting('app.role', true) = 'superadmin'
  );

-- ── audit_log_v2 (special: tenant_id is NULLABLE for platform events) ────────
-- Tenant-attributed rows (tenant_id NOT NULL) follow the standard tenant pin.
-- Platform-level rows (tenant_id IS NULL) are readable/writable ONLY by a
-- superadmin context — never by a tenant — so a tenant can't see the cross-tenant
-- platform audit trail (whose `meta` often carries other tenants' identifiers).
-- AUDIT #29/#41.
ALTER TABLE audit_log_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log_v2 FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_log_v2;
CREATE POLICY tenant_isolation ON audit_log_v2
  USING (
    tenant_id = current_setting('app.tenant_id', true)
    OR (tenant_id IS NULL AND current_setting('app.role', true) = 'superadmin')
    OR current_setting('app.role', true) = 'superadmin'
  )
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)
    OR (tenant_id IS NULL AND current_setting('app.role', true) = 'superadmin')
    OR current_setting('app.role', true) = 'superadmin'
  );

-- ── data_listing / data_purchase (special: CROSS-TENANT public shelf) ────────
-- The inter-tenant company-data marketplace (modules/data-market). These tables
-- DELIBERATELY have no plain `tenant_id`: BROWSE is cross-tenant (you see OTHER
-- tenants' ACTIVE listings), so the standard tenant-pin loop above CANNOT apply.
-- Bespoke policies instead:
--   • data_listing — TWO permissive policies (OR'd for SELECT):
--       - `data_listing_shelf` (FOR SELECT): any ACTIVE, live row is public — this
--         is the shelf a buyer browses. Read-only; grants NO write.
--       - `data_listing_owner` (FOR ALL): the SELLER's full access to its own rows
--         (any status), and the ONLY write path — INSERT/UPDATE/DELETE are pinned
--         to seller_tenant_id = app.tenant_id (superadmin bypass as elsewhere).
--     Net: a buyer can READ others' active listings but can only WRITE its own.
--   • data_purchase — buyer OR seller may READ a ledger row; only the BUYER writes
--     it (WITH CHECK pins buyer_tenant_id = app.tenant_id).
-- NOTE: the app ALSO enforces these with explicit WHERE clauses in
-- modules/data-market/repo.ts (belt-and-suspenders) — under the owner/BYPASSRLS
-- fallback (APP_POSTGRES_URL unset) those WHEREs are the SOLE control; these
-- policies engage once the NOBYPASSRLS app_user role is live.
ALTER TABLE data_listing ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_listing FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_listing_shelf ON data_listing;
DROP POLICY IF EXISTS data_listing_owner ON data_listing;
CREATE POLICY data_listing_shelf ON data_listing
  FOR SELECT
  USING (status = 'active' AND deleted_at IS NULL);
CREATE POLICY data_listing_owner ON data_listing
  FOR ALL
  USING (
    seller_tenant_id = current_setting('app.tenant_id', true)
    OR current_setting('app.role', true) = 'superadmin'
  )
  WITH CHECK (
    seller_tenant_id = current_setting('app.tenant_id', true)
    OR current_setting('app.role', true) = 'superadmin'
  );

ALTER TABLE data_purchase ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_purchase FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_purchase_isolation ON data_purchase;
CREATE POLICY data_purchase_isolation ON data_purchase
  USING (
    buyer_tenant_id = current_setting('app.tenant_id', true)
    OR seller_tenant_id = current_setting('app.tenant_id', true)
    OR current_setting('app.role', true) = 'superadmin'
  )
  WITH CHECK (
    buyer_tenant_id = current_setting('app.tenant_id', true)
    OR current_setting('app.role', true) = 'superadmin'
  );

-- ── Intentionally NOT tenant-RLS'd (no tenant_id column) ─────────────────────
-- GLOBAL catalogs / identity, gated at the app layer (a user sees a tenant only
-- via a membership row, which IS RLS'd above):
--   app_user, tenant, platform_setting_v2, vertical, module_catalog,
--   ai_provider, ai_model (superadmin-managed AI catalog; their tenant-scoped
--   siblings ai_credential/tenant_active_model/ai_usage ARE RLS'd above — #27)
-- USER-scoped pre-tenant tables (login/session/reset/theme resolve by user_id
-- before a tenant context exists), gated in the service layer:
--   auth_session, password_reset, user_theme
-- Legacy prototype tables (lib/db/schema.ts) are out of scope for the rebuild RLS.
