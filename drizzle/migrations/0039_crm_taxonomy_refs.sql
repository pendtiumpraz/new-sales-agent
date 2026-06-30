-- CRM taxonomy soft-refs: add company_v2.industry_id + contact.occupation_id
-- (filled by taxonomy classify-on-enrich) + their lookup indexes. ADDITIVE &
-- IDEMPOTENT (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS). NO foreign
-- keys (soft refs). Companion to 0038 (which creates the industry/occupation
-- catalogs). Adding a NULLable column is non-rewriting/instant in Postgres.
--
-- NOTE: `ALTER TABLE ... ADD COLUMN` is additive but the conservative guard in
-- scripts/apply-rebuild-migration.mts ABORTS on any `alter table`. Apply this one
-- via psql / the Neon SQL editor (it is safe + idempotent), not that script.

ALTER TABLE "company_v2" ADD COLUMN IF NOT EXISTS "industry_id" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "occupation_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_v2_industry_idx" ON "company_v2" USING btree ("tenant_id","industry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_occupation_idx" ON "contact" USING btree ("tenant_id","occupation_id");
