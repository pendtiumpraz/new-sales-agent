-- Row-Level Security (doc 19). APPLIED IN SLICE 2 — not part of the auto-run
-- drizzle migrations, because enabling RLS before route handlers set the tenant
-- context (via lib/db/tenant-context.ts withTenant) would make every db route
-- return nothing. Apply this only after handlers adopt withTenant.
--
-- Why FORCE: the app usually connects as the table owner, and owners BYPASS RLS
-- by default. FORCE makes policies apply to the owner connection too. The
-- superadmin escape hatch is then the policy predicate (app.role = 'superadmin'),
-- not a DB superuser — keeping it auditable (doc 26).
--
-- current_setting(..., true) returns NULL (not error) when unset → fail-closed:
-- no context means no rows (except superadmin).

-- Helper note: run inside withTenant(), which sets:
--   app.tenant_id, app.user_id, app.role  (transaction-local)

-- ── Tenant-scoped data tables ──────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'kb','deals','contacts','conversations','messages',
    'autopilot_runs','cadences','cadence_enrollments','cadence_step_run','engagement_event','auto_reply_event','credit_grant',
    'company','person','contact_point','product',
    'ai_credential','tenant_active_model','ai_usage',
    'crawl_job','ingest_batch','positioning_insight',
    'sending_account','email_template','send_job','suppression',
    'subscription'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (
          tenant_id = current_setting('app.tenant_id', true)
          OR current_setting('app.role', true) = 'superadmin'
        );
    $f$, t);
  END LOOP;
END $$;

-- ── Foundation tables ──────────────────────────────────────────────────────
-- memberships: a user must see their OWN rows even before a tenant is selected
-- (login resolves "which tenants am I in?" by user_id). Hence the user_id clause.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON memberships
  USING (
    tenant_id = current_setting('app.tenant_id', true)
    OR user_id = current_setting('app.user_id', true)
    OR current_setting('app.role', true) = 'superadmin'
  );

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invites
  USING (
    tenant_id = current_setting('app.tenant_id', true)
    OR current_setting('app.role', true) = 'superadmin'
  );

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_log
  USING (
    tenant_id = current_setting('app.tenant_id', true)
    OR current_setting('app.role', true) = 'superadmin'
  );

-- `tenants` and `users` are intentionally NOT tenant-RLS'd: `users` is global,
-- and `tenants` access is gated at the app layer (a user sees tenants they have a
-- membership in). Superadmin reads all via the admin/bypass connection (doc 26).
