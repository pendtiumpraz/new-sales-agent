-- Drop the redundant non-unique index on password_reset.token (audit #36).
--
-- The `token` column is declared `.unique()` in the schema, which is already
-- backed by the unique index/constraint `password_reset_token_unique` (created
-- in 0028_magenta_glorian.sql). A second, NON-UNIQUE index
-- `password_reset_token_idx` covered the exact same column for the same lookup
-- (getUnusedReset filters on `token`) — pure write-amplification + storage with
-- no read benefit, so it is removed from the schema and dropped here.
--
-- ⚠️ DESTRUCTIVE DDL — NEEDS MANUAL APPLY. Do NOT run via
-- scripts/apply-rebuild-migration.mts (its additive guard ABORTS on `drop`) nor
-- scripts/apply-additive-alter.mts (its FORBIDDEN list rejects `drop index`).
-- Apply by hand against Neon after review, e.g.:
--   psql "$POSTGRES_URL_NON_POOLING" -f drizzle/migrations/0040_drop_redundant_password_reset_token_idx.sql
-- IF EXISTS makes it a safe no-op if the index was already removed.

DROP INDEX IF EXISTS "password_reset_token_idx";
