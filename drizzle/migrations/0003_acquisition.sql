CREATE TABLE "crawl_job" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"kind" text NOT NULL,
	"input" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"posture" text DEFAULT 'compliant' NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ingest_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"origin" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"dedup_hits" integer DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positioning_insight" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"company_id" text NOT NULL,
	"product_id" text NOT NULL,
	"fit_score" integer,
	"angle" text,
	"rationale" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"objections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_channel" text,
	"draft_opener" text,
	"source" text,
	"generated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "crawl_job_tenant_idx" ON "crawl_job" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ingest_batch_tenant_idx" ON "ingest_batch" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "positioning_insight_tenant_idx" ON "positioning_insight" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "positioning_insight_uq" ON "positioning_insight" USING btree ("tenant_id","company_id","product_id");