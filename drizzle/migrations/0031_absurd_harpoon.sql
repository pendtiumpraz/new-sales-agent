CREATE TABLE "conversation_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"workspace_id" text,
	"channel" text DEFAULT 'wa' NOT NULL,
	"channel_account_id" text,
	"assigned_user_id" text,
	"last_message" text,
	"last_message_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"avatar_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"direction" text NOT NULL,
	"body" text NOT NULL,
	"channel" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"attachment_label" text,
	"meta" jsonb,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wa_outbox_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"session_id" text,
	"conversation_id" text NOT NULL,
	"contact_id" text,
	"message_id" text,
	"to_number" text,
	"body" text NOT NULL,
	"delay_ms" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_session_v2" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text,
	"label" text,
	"status" text DEFAULT 'idle' NOT NULL,
	"phone_number" text,
	"qr" text,
	"gateway" text DEFAULT 'extension' NOT NULL,
	"meta" jsonb,
	"last_seen_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conversation_v2_tenant_idx" ON "conversation_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "conversation_v2_contact_idx" ON "conversation_v2" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE INDEX "conversation_v2_workspace_idx" ON "conversation_v2" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "conversation_v2_last_msg_idx" ON "conversation_v2" USING btree ("tenant_id","last_message_at");--> statement-breakpoint
CREATE INDEX "message_v2_tenant_idx" ON "message_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "message_v2_conversation_idx" ON "message_v2" USING btree ("tenant_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "wa_outbox_v2_tenant_idx" ON "wa_outbox_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "wa_outbox_v2_status_idx" ON "wa_outbox_v2" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "wa_outbox_v2_conversation_idx" ON "wa_outbox_v2" USING btree ("tenant_id","conversation_id");--> statement-breakpoint
CREATE INDEX "wa_outbox_v2_scheduled_idx" ON "wa_outbox_v2" USING btree ("tenant_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "wa_session_v2_tenant_idx" ON "wa_session_v2" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "wa_session_v2_user_idx" ON "wa_session_v2" USING btree ("tenant_id","user_id");