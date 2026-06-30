-- Discovery classify-on-enrich: store the resolved taxonomy ids on CRM nodes.
-- ADDITIVE-ONLY (ALTER TABLE ADD COLUMN / CREATE INDEX). Operator applies this;
-- DO NOT auto-run. Both columns are NULLABLE plain-text SOFT REFS (no FK) into the
-- taxonomy catalogs — integrity is enforced in the service layer, like every other
-- *_id in the rebuild:
--   - company_v2.industry_id  → industry.id   (set by taxonomyService.classify "industry")
--   - contact.occupation_id   → occupation.id (set by taxonomyService.classify "occupation")
-- The existing free-text company_v2.industry label is kept (as-captured); the new
-- industry_id is the resolved master-data link.

ALTER TABLE "company_v2" ADD COLUMN IF NOT EXISTS "industry_id" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "occupation_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_v2_industry_idx" ON "company_v2" USING btree ("tenant_id","industry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_occupation_idx" ON "contact" USING btree ("tenant_id","occupation_id");
