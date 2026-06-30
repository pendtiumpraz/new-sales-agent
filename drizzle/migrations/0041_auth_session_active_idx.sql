-- Partial index supporting the active-session hot path (audit #51).
--
-- ADDITIVE-ONLY (CREATE INDEX IF NOT EXISTS). Safe to apply via
-- scripts/apply-additive-alter.mts (its allow-list permits CREATE INDEX IF NOT
-- EXISTS); operator applies — DO NOT auto-run.
--
-- `hasActiveSession()` (the per-request revocation gate) and `purgeExpiredSessions`
-- both scope to non-revoked rows. A partial index on `user_id WHERE revoked_at
-- IS NULL` keeps the index small (revoked rows are excluded) and serves the live
-- lookup directly. Complements the existing full `auth_session_user_idx` (which
-- still backs `listSessionsForUser` / `countSessionsForUser`).

CREATE INDEX IF NOT EXISTS "auth_session_active_user_idx" ON "auth_session" USING btree ("user_id") WHERE "revoked_at" is null;
