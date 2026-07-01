-- 0046_notification.sql — ADDITIVE. Creates the persistent notification feed that
-- backs the topbar bell (replacing the old bell → router.push("/inbox") stub).
--
-- ONE new table (`notification`). Best-effort event rows written at each trigger
-- point (new lead, won deal, escalation, low quota, marketplace sale, order
-- converted, member added, tenant activated/suspended). `user_id` NULL = a
-- tenant-wide notice every member sees; else private to that user.
--
-- Everything is IF NOT EXISTS / DROP POLICY IF EXISTS → idempotent, safe to
-- re-run, breaks no existing rows. RLS follows the standard tenant-isolation shape
-- (drizzle/rls/enable-rls.sql); the GRANT to the NOBYPASSRLS app role is applied by
-- the runner (scripts/migrate-notification.mts) since the role name is env-derived.

CREATE TABLE IF NOT EXISTS notification (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS notification_ctx_idx ON notification (tenant_id, user_id, read);
CREATE INDEX IF NOT EXISTS notification_created_idx ON notification (tenant_id, created_at);

ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON notification;
CREATE POLICY tenant_isolation ON notification
  USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.role', true) = 'superadmin')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.role', true) = 'superadmin');
