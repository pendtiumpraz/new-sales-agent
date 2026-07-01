-- Wire the loose /penawaran (quote) feature into the CRM graph: link a quote to a
-- CRM `contact` + `deal`. ADDITIVE + IDEMPOTENT. These columns already ship in
-- 0024_add_quote.sql, but this ADD COLUMN IF NOT EXISTS guarantees them on any DB
-- that predates that shape and documents the CRM link as its own migration. No
-- data migration; both columns are nullable (free-text "kontak manual" quotes and
-- every existing quote keep working with contact_id / deal_id = NULL).
ALTER TABLE "quote" ADD COLUMN IF NOT EXISTS "contact_id" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN IF NOT EXISTS "deal_id" text;
