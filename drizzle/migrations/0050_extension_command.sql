-- 0050_extension_command.sql — ADDITIVE. Platform/agent → browser-extension COMMAND
-- queue (Fase 3, PART A "DRIVE"): an authorized agent (write-scope API key, Fase 1)
-- ENQUEUES a command here; the tenant's extension (per-rep ingest token, NOT the API
-- key) POLLS the queue, runs the matching RPA scraper in the rep's own browser, and
-- POSTs the result back. Crawl OUTPUT lands in the CRM via the normal /api/ingest
-- sink — this table only carries the command lifecycle.
--
-- A command moves `queued → claimed → done|failed`. The claim path flips the oldest
-- N queued rows atomically (UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED),
-- filtered `target_user_id IS NULL OR = <rep>`) so two pollers never grab the same
-- command.
--
-- ONE new table (`extension_command`). Everything is IF NOT EXISTS / DROP POLICY IF
-- EXISTS → idempotent, safe to re-run, breaks no existing rows. RLS follows the
-- standard tenant-isolation shape; the GRANT to the NOBYPASSRLS app role is applied
-- by the runner (scripts/migrate-ext-command.mts) since the role name is env-derived.

CREATE TABLE IF NOT EXISTS extension_command (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  target_user_id text,
  type text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  result jsonb,
  error text,
  claimed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS extension_command_tenant_status_idx ON extension_command (tenant_id, status);
CREATE INDEX IF NOT EXISTS extension_command_tenant_created_idx ON extension_command (tenant_id, created_at);

ALTER TABLE extension_command ENABLE ROW LEVEL SECURITY;
ALTER TABLE extension_command FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON extension_command;
CREATE POLICY tenant_isolation ON extension_command
  USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.role', true) = 'superadmin')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.role', true) = 'superadmin');
