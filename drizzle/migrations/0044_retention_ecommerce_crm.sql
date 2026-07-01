-- 0044_retention_ecommerce_crm.sql — ADDITIVE. Wires two loose features into the
-- CRM graph:
--   A) /retention — real contact enrollment into a retention flow. Adds the
--      `retention_enrollment` edge table (mirrors outreach `cadence_enrollment_v2`)
--      that connects a `retention_flow` to a CRM `contact`.
--   B) /ecommerce — order → CRM conversion. Reuses EXISTING tables only
--      (marketplace_order.contact_id, crm contact/deal/pipeline_stage), so it needs
--      NO schema change — the convert path is pure service/route logic.
--
-- Only ONE new table (`retention_enrollment`). Everything is IF NOT EXISTS /
-- DROP POLICY IF EXISTS → idempotent, safe to re-run, breaks no existing rows.
--
-- RLS follows the standard tenant-isolation shape (drizzle/rls/enable-rls.sql); the
-- GRANT to the NOBYPASSRLS app role is applied by the runner
-- (scripts/migrate-retention-ecom.mts) since the role name is environment-derived.

CREATE TABLE IF NOT EXISTS retention_enrollment (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  flow_id text NOT NULL,
  contact_id text NOT NULL,
  workspace_id text,
  assigned_user_id text,
  current_step integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  next_run_at timestamptz,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  last_step_at timestamptz,
  completed_at timestamptz,
  stop_reason text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS retention_enrollment_tenant_idx ON retention_enrollment (tenant_id);
CREATE INDEX IF NOT EXISTS retention_enrollment_flow_idx ON retention_enrollment (tenant_id, flow_id);
CREATE INDEX IF NOT EXISTS retention_enrollment_contact_idx ON retention_enrollment (tenant_id, contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS retention_enrollment_flow_contact_uq ON retention_enrollment (tenant_id, flow_id, contact_id);
CREATE INDEX IF NOT EXISTS retention_enrollment_due_idx ON retention_enrollment (tenant_id, status, next_run_at);

ALTER TABLE retention_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_enrollment FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON retention_enrollment;
CREATE POLICY tenant_isolation ON retention_enrollment
  USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.role', true) = 'superadmin')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.role', true) = 'superadmin');
