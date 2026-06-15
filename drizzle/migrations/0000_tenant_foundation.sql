CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target" text,
	"meta" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autopilot_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"started_at" text NOT NULL,
	"finished_at" text,
	"status" text NOT NULL,
	"config" jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cadence_enrollments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"cadence_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"current_step_idx" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'aktif' NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_step_at" timestamp with time zone,
	"next_step_due_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cadences" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"steps" jsonb NOT NULL,
	"channel_mix" jsonb NOT NULL,
	"enrolled" integer DEFAULT 0 NOT NULL,
	"reply_rate" real DEFAULT 0 NOT NULL,
	"owner" text,
	"created_at" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"name" text NOT NULL,
	"title" text,
	"company_id" text,
	"company" text,
	"industry" text,
	"city" text,
	"email" text,
	"phone" text,
	"channel_preference" text,
	"consent" text,
	"consent_source" text,
	"consent_date" text,
	"last_activity" text,
	"avatar_color" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"contact_id" text NOT NULL,
	"contact_name" text,
	"company" text,
	"channel" text NOT NULL,
	"last_message" text,
	"last_timestamp" text,
	"unread" integer DEFAULT 0 NOT NULL,
	"avatar_color" text,
	"assigned_to" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"name" text NOT NULL,
	"contact_id" text,
	"contact_name" text,
	"company" text,
	"value" real NOT NULL,
	"stage" text NOT NULL,
	"expected_close" text,
	"source_channel" text,
	"owner" text,
	"avatar_color" text,
	"created_at" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "kb" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"conversation_id" text NOT NULL,
	"direction" text NOT NULL,
	"body" text NOT NULL,
	"timestamp" text NOT NULL,
	"status" text,
	"subject" text,
	"attachment_label" text
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'starter' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" text NOT NULL,
	"avatar_color" text NOT NULL,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "audit_log_tenant_idx" ON "audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "invites_tenant_idx" ON "invites" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_tenant_user_uq" ON "memberships" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_tenant_idx" ON "memberships" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");