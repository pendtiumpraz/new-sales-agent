-- 0048_api_key.sql — ADDITIVE. Per-account (BYOA) API keys: a tenant's external
-- agent authenticates to the {ok,data} data-level API with a scoped, revocable
-- Bearer key (`msk_live_…`).
--
-- SECURITY: only the sha256 hex of the full key is stored (`key_hash`, UNIQUE);
-- the plaintext is shown ONCE at creation and is unrecoverable. `key_prefix` is a
-- short display-only fragment (e.g. `msk_live_ab`). Scope is `read` | `write`.
--
-- ONE new table (`api_key`). Everything is IF NOT EXISTS / DROP POLICY IF EXISTS →
-- idempotent, safe to re-run, breaks no existing rows. RLS follows the standard
-- tenant-isolation shape (drizzle/rls/enable-rls.sql); the GRANT to the NOBYPASSRLS
-- app role is applied by the runner (scripts/migrate-apikey.mts) since the role
-- name is env-derived.

CREATE TABLE IF NOT EXISTS api_key (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  label text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  scope text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS api_key_tenant_idx ON api_key (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS api_key_key_hash_uq ON api_key (key_hash);

ALTER TABLE api_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON api_key;
CREATE POLICY tenant_isolation ON api_key
  USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.role', true) = 'superadmin')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.role', true) = 'superadmin');
