-- Dedicated runtime role that RESPECTS Row-Level Security (doc 19).
--
-- New roles default to NOBYPASSRLS, so `app_user` is subject to the
-- tenant_isolation policies — unlike `neondb_owner`, which has BYPASSRLS. The
-- app connects as this role at runtime (via APP_POSTGRES_URL); neondb_owner
-- stays the owner for migrations / drizzle-kit / studio.
--
-- Run as neondb_owner (it has CREATEROLE). REPLACE <STRONG_PASSWORD> first.
--   psql "$POSTGRES_URL_NON_POOLING" -f drizzle/rls/create-app-role.sql
-- or paste into the Neon SQL editor.

CREATE ROLE app_user LOGIN PASSWORD '<STRONG_PASSWORD>';

-- Schema + table access (RLS still filters rows on top of these grants).
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Auto-grant on future tables/sequences created by the owner (migrations).
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Sanity check — expect rolbypassrls = false:
--   SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'app_user';
