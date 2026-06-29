CREATE TABLE "autopilot_run_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text,
	"contact_id" text,
	"conversation_id" text,
	"enrollment_id" text,
	"mode" text DEFAULT 'suggest' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cadence_enrollment_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"cadence_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"workspace_id" text,
	"conversation_id" text,
	"assigned_user_id" text,
	"current_step" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_step_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"stop_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cadence_step_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"cadence_id" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"channel" text DEFAULT 'wa' NOT NULL,
	"delay_hours" integer DEFAULT 0 NOT NULL,
	"subject" text,
	"template" text DEFAULT '' NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cadence_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"step_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "escalation" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"contact_id" text,
	"workspace_id" text,
	"autopilot_run_id" text,
	"reason" text DEFAULT 'manual' NOT NULL,
	"detail" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"raised_by" text,
	"assigned_user_id" text,
	"resolution_note" text,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "handoff" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"contact_id" text,
	"workspace_id" text,
	"escalation_id" text,
	"reason" text,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assigned_user_id" text,
	"claimed_by" text,
	"due_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "autopilot_run_v2_tenant_idx" ON "autopilot_run_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "autopilot_run_v2_conversation_idx" ON "autopilot_run_v2" USING btree ("tenant_id","conversation_id");--> statement-breakpoint
CREATE INDEX "autopilot_run_v2_status_idx" ON "autopilot_run_v2" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "cadence_enrollment_v2_tenant_idx" ON "cadence_enrollment_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cadence_enrollment_v2_cadence_idx" ON "cadence_enrollment_v2" USING btree ("tenant_id","cadence_id");--> statement-breakpoint
CREATE INDEX "cadence_enrollment_v2_contact_idx" ON "cadence_enrollment_v2" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cadence_enrollment_v2_cadence_contact_uq" ON "cadence_enrollment_v2" USING btree ("tenant_id","cadence_id","contact_id");--> statement-breakpoint
CREATE INDEX "cadence_enrollment_v2_due_idx" ON "cadence_enrollment_v2" USING btree ("tenant_id","status","next_run_at");--> statement-breakpoint
CREATE INDEX "cadence_step_v2_tenant_idx" ON "cadence_step_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cadence_step_v2_cadence_idx" ON "cadence_step_v2" USING btree ("tenant_id","cadence_id");--> statement-breakpoint
CREATE INDEX "cadence_v2_tenant_idx" ON "cadence_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cadence_v2_workspace_idx" ON "cadence_v2" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "escalation_tenant_idx" ON "escalation" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "escalation_conversation_idx" ON "escalation" USING btree ("tenant_id","conversation_id");--> statement-breakpoint
CREATE INDEX "escalation_status_idx" ON "escalation" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "handoff_tenant_idx" ON "handoff" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "handoff_conversation_idx" ON "handoff" USING btree ("tenant_id","conversation_id");--> statement-breakpoint
CREATE INDEX "handoff_status_idx" ON "handoff" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "handoff_assignee_idx" ON "handoff" USING btree ("tenant_id","assigned_user_id");