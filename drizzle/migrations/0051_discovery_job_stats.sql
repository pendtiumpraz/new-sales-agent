-- 0051_discovery_job_stats.sql — ADDITIVE. DISCOVERY HISTORY: per-run rollup of the
-- NEW graph nodes an extension crawl flush created, so each `discovery_job` shows how
-- many companies + contacts THAT batch produced (surfaced in the Enrichment "Riwayat").
--
-- Two nullable-with-default integer columns on the EXISTING `discovery_job` table.
-- No new table, no RLS/GRANT change (the table is already RLS-enabled + granted to the
-- app role). IF NOT EXISTS → idempotent, safe to re-run, breaks no existing rows.
-- Web-discovery (runDiscovery) jobs leave these 0 and keep using `results_count`.
ALTER TABLE "discovery_job" ADD COLUMN IF NOT EXISTS "companies_created" integer DEFAULT 0 NOT NULL;
ALTER TABLE "discovery_job" ADD COLUMN IF NOT EXISTS "contacts_created" integer DEFAULT 0 NOT NULL;
