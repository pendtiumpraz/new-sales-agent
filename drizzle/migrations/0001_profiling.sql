CREATE TABLE "company" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"industry" text,
	"size" text,
	"hq_country" text,
	"summary" text,
	"tech_stack" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"products" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text,
	"source_url" text,
	"captured_at" timestamp with time zone,
	"captured_mode" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_point" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"channel" text NOT NULL,
	"value" text NOT NULL,
	"label" text,
	"source" text,
	"source_url" text,
	"captured_at" timestamp with time zone,
	"captured_mode" text,
	"consent_status" text DEFAULT 'unknown' NOT NULL,
	"verified_at" timestamp with time zone,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"company_id" text,
	"full_name" text NOT NULL,
	"title" text,
	"department" text,
	"seniority" text,
	"location" text,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text,
	"source_url" text,
	"captured_at" timestamp with time zone,
	"captured_mode" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"value_props" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricing_notes" text,
	"target_market" text,
	"icp" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "company_tenant_idx" ON "company" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "company_domain_idx" ON "company" USING btree ("tenant_id","domain");--> statement-breakpoint
CREATE INDEX "contact_point_tenant_idx" ON "contact_point" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "contact_point_owner_idx" ON "contact_point" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_point_dedup_uq" ON "contact_point" USING btree ("tenant_id","owner_type","owner_id","channel","value");--> statement-breakpoint
CREATE INDEX "person_tenant_idx" ON "person" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "person_company_idx" ON "person" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "product_tenant_idx" ON "product" USING btree ("tenant_id");