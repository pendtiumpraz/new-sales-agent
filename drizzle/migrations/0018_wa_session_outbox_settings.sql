CREATE TABLE "platform_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"session_id" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_session" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"qr" text,
	"wa_number" text,
	"last_seen_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "wa_outbox_pending_idx" ON "wa_outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wa_session_tenant_idx" ON "wa_session" USING btree ("tenant_id");