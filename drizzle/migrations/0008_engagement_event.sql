CREATE TABLE "engagement_event" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"kind" text NOT NULL,
	"contact_id" text,
	"product_id" text,
	"channel" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"checkout_url" text,
	"send_job_id" text,
	"message" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "engagement_event_tenant_idx" ON "engagement_event" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "engagement_event_dedup_idx" ON "engagement_event" USING btree ("tenant_id","contact_id","product_id","kind");