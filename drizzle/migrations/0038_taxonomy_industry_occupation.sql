-- Taxonomy master data: industry + occupation (the catalogs the AI classifies
-- crawled companies/people into). ADDITIVE-ONLY (CREATE TABLE / CREATE INDEX).
-- Operator applies this; DO NOT auto-run.
--
-- tenant_id is NULLABLE: NULL = the GLOBAL canonical base (shared by all tenants);
-- non-null = private to that tenant. The UNIQUE index on (tenant_id, slug) is
-- declared NULLS NOT DISTINCT so the global namespace (tenant_id NULL) is deduped
-- too — without it, Postgres treats NULLs as distinct and duplicate global rows
-- could slip in. Requires Postgres 15+ (Neon supports it). NO foreign keys.

CREATE TABLE IF NOT EXISTS "industry" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" text,
	"name_en" text,
	"source" text DEFAULT 'seed' NOT NULL,
	"confidence" real,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "occupation" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" text,
	"industry_id" text,
	"name_en" text,
	"source" text DEFAULT 'seed' NOT NULL,
	"confidence" real,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "industry_tenant_idx" ON "industry" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "industry_tenant_slug_uq" ON "industry" USING btree ("tenant_id","slug") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "occupation_tenant_idx" ON "occupation" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "occupation_industry_idx" ON "occupation" USING btree ("tenant_id","industry_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "occupation_tenant_slug_uq" ON "occupation" USING btree ("tenant_id","slug") NULLS NOT DISTINCT;
