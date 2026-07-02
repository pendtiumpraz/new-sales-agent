-- 0049_agent_task.sql — ADDITIVE. BYOA (bring-your-own-agent) generation queue
-- (Fase 2): when a tenant runs in `byoa` mode the platform ENQUEUES a task here;
-- the tenant's own agent (authenticated with a write-scope API key, Fase 1) POLLS
-- the queue, generates with ITS OWN model, and POSTs the result back.
--
-- A task moves `queued → claimed → done|failed`. The claim path flips the oldest N
-- queued rows atomically (UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED))
-- so two pollers never grab the same task.
--
-- ONE new table (`agent_task`). Everything is IF NOT EXISTS / DROP POLICY IF EXISTS
-- → idempotent, safe to re-run, breaks no existing rows. RLS follows the standard
-- tenant-isolation shape; the GRANT to the NOBYPASSRLS app role is applied by the
-- runner (scripts/migrate-agent-task.mts) since the role name is env-derived.

CREATE TABLE IF NOT EXISTS agent_task (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  ref_type text,
  ref_id text,
  claimed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS agent_task_tenant_status_idx ON agent_task (tenant_id, status);
CREATE INDEX IF NOT EXISTS agent_task_tenant_created_idx ON agent_task (tenant_id, created_at);

ALTER TABLE agent_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_task FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agent_task;
CREATE POLICY tenant_isolation ON agent_task
  USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.role', true) = 'superadmin')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.role', true) = 'superadmin');
