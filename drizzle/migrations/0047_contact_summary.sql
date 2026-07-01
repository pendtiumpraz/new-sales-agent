-- 0047_contact_summary.sql — ADDITIVE. Adds a nullable `summary` column to the
-- rebuild `contact` table so the extension-crawl ingest (rerouted from the legacy
-- `person` table to the rebuild graph via enrichmentService.ingestGraph) has a home
-- for a person's free-text profile summary (LinkedIn "about" / the in-page AI
-- `profileSummary`). Nullable → non-rewriting/instant in Postgres; IF NOT EXISTS →
-- idempotent, safe to re-run. No RLS/GRANT change needed: table-level grants on
-- `contact` already cover new columns.
--
--   run: npx tsx scripts/apply-additive-alter.mts drizzle/migrations/0047_contact_summary.sql
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "summary" text;
