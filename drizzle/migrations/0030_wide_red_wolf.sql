CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"body" text,
	"due_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"actor_user_id" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "company_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"industry" text,
	"size" text,
	"hq_country" text,
	"hq_city" text,
	"website" text,
	"summary" text,
	"tech_stack" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"socials" jsonb,
	"owner_user_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"company_id" text,
	"workspace_id" text,
	"full_name" text NOT NULL,
	"title" text,
	"department" text,
	"seniority" text,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"city" text,
	"location" text,
	"channel_preference" text,
	"socials" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"segment" text DEFAULT 'unknown' NOT NULL,
	"enrichment_status" text DEFAULT 'none' NOT NULL,
	"fit_score" real,
	"fit_reason" text,
	"lifecycle_stage" text DEFAULT 'lead' NOT NULL,
	"owner_user_id" text,
	"consent_status" text DEFAULT 'unknown' NOT NULL,
	"source" text,
	"last_activity_at" timestamp with time zone,
	"avatar_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deal" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"pipeline_id" text,
	"stage_id" text,
	"contact_id" text,
	"company_id" text,
	"workspace_id" text,
	"product_id" text,
	"value" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"expected_close" text,
	"closed_at" timestamp with time zone,
	"lost_reason" text,
	"source_channel" text,
	"owner_user_id" text,
	"avatar_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipeline_stage" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"probability" integer,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipeline" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"workspace_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "activity_tenant_idx" ON "activity" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "activity_subject_idx" ON "activity" USING btree ("tenant_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "company_v2_tenant_idx" ON "company_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "company_v2_domain_idx" ON "company_v2" USING btree ("tenant_id","domain");--> statement-breakpoint
CREATE INDEX "contact_tenant_idx" ON "contact" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "contact_company_idx" ON "contact" USING btree ("tenant_id","company_id");--> statement-breakpoint
CREATE INDEX "contact_workspace_idx" ON "contact" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "contact_owner_idx" ON "contact" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "deal_tenant_idx" ON "deal" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "deal_stage_idx" ON "deal" USING btree ("tenant_id","stage_id");--> statement-breakpoint
CREATE INDEX "deal_contact_idx" ON "deal" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE INDEX "deal_pipeline_idx" ON "deal" USING btree ("tenant_id","pipeline_id");--> statement-breakpoint
CREATE INDEX "pipeline_stage_tenant_idx" ON "pipeline_stage" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pipeline_stage_pipeline_idx" ON "pipeline_stage" USING btree ("tenant_id","pipeline_id");--> statement-breakpoint
CREATE INDEX "pipeline_tenant_idx" ON "pipeline" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pipeline_workspace_idx" ON "pipeline" USING btree ("tenant_id","workspace_id");