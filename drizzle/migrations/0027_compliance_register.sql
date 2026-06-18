CREATE TABLE "consent_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"contact_name" text NOT NULL,
	"source" text NOT NULL,
	"channel" text,
	"ip" text,
	"version" text,
	"status" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dpia" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"process" text NOT NULL,
	"data_category" text NOT NULL,
	"risk_level" text NOT NULL,
	"status" text NOT NULL,
	"owner" text NOT NULL,
	"date" text,
	"mitigations" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_risk" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"vendor" text NOT NULL,
	"category" text NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"risk_level" text NOT NULL,
	"dpa_signed" boolean DEFAULT false NOT NULL,
	"residency" text,
	"last_review" text
);
--> statement-breakpoint
CREATE INDEX "consent_log_tenant_idx" ON "consent_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "dpia_tenant_idx" ON "dpia" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "vendor_risk_tenant_idx" ON "vendor_risk" USING btree ("tenant_id");