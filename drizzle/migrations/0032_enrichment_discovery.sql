CREATE TABLE "discovery_job" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text,
	"query" text NOT NULL,
	"channel" text DEFAULT 'web' NOT NULL,
	"source" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"posture" text DEFAULT 'compliant' NOT NULL,
	"origin" text,
	"results_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "discovery_result" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"job_id" text NOT NULL,
	"workspace_id" text,
	"full_name" text,
	"company_name" text,
	"title" text,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"location" text,
	"website" text,
	"socials" jsonb,
	"snippet" text,
	"source_url" text,
	"raw" jsonb,
	"saved_at" timestamp with time zone,
	"saved_contact_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "enrichment_record" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"contact_id" text,
	"workspace_id" text,
	"result_id" text,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text,
	"classification" text DEFAULT 'unknown' NOT NULL,
	"fit_score" real,
	"fit_reason" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"pushed_contact_id" text,
	"pushed_at" timestamp with time zone,
	"enriched_at" timestamp with time zone,
	"classified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "discovery_job_tenant_idx" ON "discovery_job" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "discovery_job_workspace_idx" ON "discovery_job" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "discovery_job_status_idx" ON "discovery_job" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "discovery_result_tenant_idx" ON "discovery_result" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "discovery_result_job_idx" ON "discovery_result" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "discovery_result_workspace_idx" ON "discovery_result" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "enrichment_record_tenant_idx" ON "enrichment_record" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "enrichment_record_contact_idx" ON "enrichment_record" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE INDEX "enrichment_record_workspace_idx" ON "enrichment_record" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "enrichment_record_status_idx" ON "enrichment_record" USING btree ("tenant_id","status");