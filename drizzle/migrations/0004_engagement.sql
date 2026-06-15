CREATE TABLE "email_template" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "send_job" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"sending_account_id" text,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"feature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sending_account" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text,
	"type" text DEFAULT 'smtp' NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"config_enc" text,
	"daily_limit" integer DEFAULT 200 NOT NULL,
	"sent_today" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"email" text NOT NULL,
	"reason" text DEFAULT 'opt_out' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_template_tenant_idx" ON "email_template" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "send_job_tenant_idx" ON "send_job" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "send_job_status_idx" ON "send_job" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "sending_account_tenant_idx" ON "sending_account" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_tenant_email_uq" ON "suppression" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "suppression_tenant_idx" ON "suppression" USING btree ("tenant_id");