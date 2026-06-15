CREATE TABLE "cadence_step_run" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"enrollment_id" text NOT NULL,
	"cadence_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"step_idx" integer NOT NULL,
	"channel" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"send_job_id" text,
	"ai_source" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cadence_step_run_tenant_idx" ON "cadence_step_run" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cadence_step_run_enrollment_idx" ON "cadence_step_run" USING btree ("tenant_id","enrollment_id");